// Design Ref: §4.3·§5.1 — 분석 시뮬레이션 칸에 마우스로 돌려 볼 수 있는 입체(3D) 사람 모델을 그린다 (three.js)
// MediaPipe가 주는 "실제 크기 3D 관절 위치(worldLandmarks, 단위 m)"로 팔다리 덩어리를 세운다.
// 부위마다 BodyPart 이름을 붙여 두었으므로, PLAN 작업 18(누적 충격 색칠)에서 colorOf로 부위별 색을 바꿀 수 있다.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LANDMARK as L } from "@/lib/engine/landmarks";
import type { BodyPart, PoseLandmark } from "@/lib/types";
import { PREDICTED_OPACITY, type FigureOptions } from "./bodyFigure";

type Landmark = PoseLandmark;
type NormalizedLandmark = PoseLandmark;

/** 3D 장면에 세울 선수 한 명 (선수 추적기 결과) */
export interface ScenePerson {
  /** 0 = 첫 번째 선수, 1 = 두 번째 선수 (색이 정해진다) */
  slot: number;
  image: PoseLandmark[];
  world: PoseLandmark[];
  /** 이번 장면에서 못 찾아 예측으로 보여 주는 중 */
  predicted: boolean;
}

/** 관절 하나, 또는 두 관절의 가운데 */
type Anchor = number | readonly [number, number];

interface LimbSpec {
  part: BodyPart | null;
  from: Anchor;
  to: Anchor;
  /** 팔다리 덩어리 반지름(m). 보통 체형 기준의 눈대중 값 (그림용, 계산에 쓰지 않음) */
  radius: number;
}

function sideLimbs(side: "left" | "right"): LimbSpec[] {
  const left = side === "left";
  return [
    { part: left ? "upperArmLeft" : "upperArmRight", from: left ? L.leftShoulder : L.rightShoulder, to: left ? L.leftElbow : L.rightElbow, radius: 0.045 },
    { part: left ? "forearmLeft" : "forearmRight", from: left ? L.leftElbow : L.rightElbow, to: left ? L.leftWrist : L.rightWrist, radius: 0.038 },
    { part: null, from: left ? L.leftWrist : L.rightWrist, to: left ? [L.leftPinky, L.leftIndex] : [L.rightPinky, L.rightIndex], radius: 0.04 },
    { part: left ? "thighLeft" : "thighRight", from: left ? L.leftHip : L.rightHip, to: left ? L.leftKnee : L.rightKnee, radius: 0.075 },
    { part: left ? "lowerLegLeft" : "lowerLegRight", from: left ? L.leftKnee : L.rightKnee, to: left ? L.leftAnkle : L.rightAnkle, radius: 0.052 },
    { part: null, from: left ? L.leftAnkle : L.rightAnkle, to: left ? L.leftFootIndex : L.rightFootIndex, radius: 0.035 },
  ];
}

const LIMBS = [...sideLimbs("left"), ...sideLimbs("right")];
const UP = new THREE.Vector3(0, 1, 0);
const HEAD_RADIUS_M = 0.105;
const NECK_RADIUS_M = 0.05;
/** 몸통 앞뒤 두께의 절반(m) */
const TORSO_HALF_DEPTH_M = 0.11;

// 모든 덩어리가 같이 쓰는 기본 모양 (크기는 scale로 바꾼다)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 20);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 20, 14);

/** 잘 안 보이는 부위는 흐리게 */
const opacityOf = (visibility: number) => 0.35 + 0.65 * visibility;

function makeMesh(geometry: THREE.BufferGeometry, part: BodyPart | null): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true }));
  mesh.userData.part = part;
  return mesh;
}

/** 두 점 사이에 원기둥을 세운다 */
function placeCylinder(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.visible = len > 1e-4;
  if (!mesh.visible) return;
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.set(radius, len, radius);
}

function placeSphere(mesh: THREE.Mesh, p: THREE.Vector3, radius: number) {
  mesh.visible = true;
  mesh.position.copy(p);
  mesh.scale.setScalar(radius);
}

/** 사람 한 명의 3D 모델 */
class Mannequin {
  readonly group = new THREE.Group();
  private readonly limbs = LIMBS.map((spec) => ({
    spec,
    body: makeMesh(UNIT_CYLINDER, spec.part),
    ends: [makeMesh(UNIT_SPHERE, spec.part), makeMesh(UNIT_SPHERE, spec.part)] as const,
  }));
  private readonly torso = makeMesh(UNIT_CYLINDER, "torsoFront");
  private readonly torsoJoints = [0, 1, 2, 3].map(() => makeMesh(UNIT_SPHERE, "torsoFront"));
  private readonly neck = makeMesh(UNIT_CYLINDER, null);
  private readonly head = makeMesh(UNIT_SPHERE, "head");
  private readonly nose = makeMesh(UNIT_SPHERE, null);

  constructor(private readonly baseColor: string) {
    for (const limb of this.limbs) this.group.add(limb.body, ...limb.ends);
    this.group.add(this.torso, ...this.torsoJoints, this.neck, this.head, this.nose);
  }

  hide() {
    this.group.visible = false;
  }

  /**
   * 관절 위치로 모델을 움직인다.
   * @param world 실제 크기 3D 관절 위치 (m, 엉덩이 가운데가 원점)
   * @param offset 화면 속 위치에 맞춰 옮길 거리 (m)
   * @returns 모델의 가장 낮은 높이 (바닥 격자 위치용)
   */
  update(world: Landmark[], offset: THREE.Vector3, options: FigureOptions): number {
    this.group.visible = true;
    // MediaPipe(오른쪽 x, 아래 y, 카메라 쪽이 -z) → three.js(오른쪽 x, 위 y, 보는 사람 쪽이 +z)
    const at = (anchor: Anchor): { p: THREE.Vector3; v: number } | null => {
      const list = typeof anchor === "number" ? [world[anchor]] : [world[anchor[0]], world[anchor[1]]];
      if (list.some((q) => !q)) return null;
      const n = list.length;
      const p = new THREE.Vector3(
        list.reduce((s, q) => s + q.x, 0) / n,
        -list.reduce((s, q) => s + q.y, 0) / n,
        -list.reduce((s, q) => s + q.z, 0) / n,
      ).add(offset);
      return { p, v: Math.min(...list.map((q) => q.visibility ?? 0)) };
    };
    const paint = (mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>, visibility: number, color?: string) => {
      mesh.material.color.set(color ?? options.colorOf?.(mesh.userData.part as BodyPart | null) ?? this.baseColor);
      mesh.material.opacity = opacityOf(visibility) * (options.opacity ?? 1);
    };
    let minY = Infinity;

    for (const { spec, body, ends } of this.limbs) {
      const a = at(spec.from);
      const b = at(spec.to);
      if (!a || !b) {
        body.visible = ends[0].visible = ends[1].visible = false;
        continue;
      }
      placeCylinder(body, a.p, b.p, spec.radius);
      placeSphere(ends[0], a.p, spec.radius);
      placeSphere(ends[1], b.p, spec.radius);
      const v = Math.min(a.v, b.v);
      for (const mesh of [body, ...ends]) paint(mesh, v);
      minY = Math.min(minY, a.p.y - spec.radius, b.p.y - spec.radius);
    }

    // 몸통: 어깨 가운데~엉덩이 가운데를 잇는 납작한 원기둥 (어깨 너비만큼 넓게)
    const ls = at(L.leftShoulder);
    const rs = at(L.rightShoulder);
    const lh = at(L.leftHip);
    const rh = at(L.rightHip);
    if (ls && rs && lh && rh) {
      const shoulderMid = ls.p.clone().add(rs.p).multiplyScalar(0.5);
      const hipMid = lh.p.clone().add(rh.p).multiplyScalar(0.5);
      const yAxis = shoulderMid.clone().sub(hipMid);
      const len = yAxis.length();
      yAxis.normalize();
      const side = ls.p.clone().sub(rs.p).add(lh.p.clone().sub(rh.p)).multiplyScalar(0.5);
      const halfWidth = side.length() / 2;
      const xAxis = side.sub(yAxis.clone().multiplyScalar(side.dot(yAxis))).normalize();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
      this.torso.visible = len > 1e-4;
      this.torso.position.addVectors(shoulderMid, hipMid).multiplyScalar(0.5);
      this.torso.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
      this.torso.scale.set(halfWidth + 0.02, len, TORSO_HALF_DEPTH_M);
      const torsoV = Math.min(ls.v, rs.v, lh.v, rh.v);
      paint(this.torso, torsoV);
      [ls, rs, lh, rh].forEach((j, i) => {
        placeSphere(this.torsoJoints[i], j.p, 0.06);
        paint(this.torsoJoints[i], j.v);
      });

      // 목과 머리: 두 귀 가운데를 머리 중심으로
      const earL = at(L.leftEar);
      const earR = at(L.rightEar);
      if (earL && earR) {
        const headCenter = earL.p.clone().add(earR.p).multiplyScalar(0.5);
        const headV = Math.min(earL.v, earR.v);
        placeCylinder(this.neck, shoulderMid, headCenter, NECK_RADIUS_M);
        paint(this.neck, headV);
        placeSphere(this.head, headCenter, HEAD_RADIUS_M);
        paint(this.head, headV);
        // 코 쪽 작은 점 = 얼굴 방향
        const nose = at(L.nose);
        if (nose) {
          const dir = nose.p.clone().sub(headCenter).normalize();
          placeSphere(this.nose, headCenter.clone().add(dir.multiplyScalar(HEAD_RADIUS_M)), 0.025);
          paint(this.nose, nose.v, "#1f2937");
        } else this.nose.visible = false;
      } else this.neck.visible = this.head.visible = this.nose.visible = false;
    } else {
      this.torso.visible = this.neck.visible = this.head.visible = this.nose.visible = false;
      for (const j of this.torsoJoints) j.visible = false;
    }
    return minY;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) (obj.material as THREE.Material).dispose();
    });
  }
}

/** 화면 속 몸통 길이와 실제 몸통 길이로 "화면 1칸 = 몇 m"를 어림한다 (두 사람 사이 거리 배치용) */
function metersPerScreenUnit(world: Landmark[], image: NormalizedLandmark[], aspect: number): number | null {
  const mid = <T extends { x: number; y: number; z: number }>(a: T, b: T) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  const ws = mid(world[L.leftShoulder], world[L.rightShoulder]);
  const wh = mid(world[L.leftHip], world[L.rightHip]);
  const is = mid(image[L.leftShoulder], image[L.rightShoulder]);
  const ih = mid(image[L.leftHip], image[L.rightHip]);
  const worldLen = Math.hypot(ws.x - wh.x, ws.y - wh.y, ws.z - wh.z);
  const imageLen = Math.hypot((is.x - ih.x) * aspect, is.y - ih.y);
  return imageLen > 1e-3 ? worldLen / imageLen : null;
}

/** 분석 시뮬레이션 칸의 3D 장면 (최대 2명) */
export class Figure3DScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 100);
  private readonly controls: OrbitControls;
  private readonly grid = new THREE.GridHelper(8, 16, 0x64748b, 0x334155);
  private readonly people: Mannequin[];
  private readonly observer: ResizeObserver;

  constructor(private readonly container: HTMLElement, colors: readonly string[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color("#111827");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3);
    this.scene.add(sun, this.grid);

    this.people = colors.map((c) => new Mannequin(c));
    for (const m of this.people) {
      m.hide();
      this.scene.add(m.group);
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.render());
    this.resetView();

    // 칸 크기가 바뀌면(창 크기, 보기 방식 전환) 그림 크기도 맞춘다
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  /** 정면에서 보는 처음 시점으로 되돌린다 */
  resetView() {
    this.camera.position.set(0, 0.2, 3.3);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.render();
  }

  /**
   * 찾은 사람들로 모델을 움직인다.
   * 두 사람의 3D 위치는 각자 엉덩이 기준이라, 영상 속 위치를 보고 좌우·위아래 간격을 어림해 벌려 놓는다 (앞뒤 거리는 알 수 없어 같은 줄에 둔다).
   */
  update(people: ScenePerson[], aspect: number, options: FigureOptions = {}) {
    // 거리 어림은 이번 장면에서 실제로 찾은 선수 기준 (예측 중인 선수는 빼고, 없으면 모두 사용)
    const basis = people.some((p) => !p.predicted) ? people.filter((p) => !p.predicted) : people;
    const scales = basis
      .map((p) => metersPerScreenUnit(p.world, p.image, aspect))
      .filter((s): s is number => s !== null);
    const mpu = scales.length ? scales.reduce((a, b) => a + b, 0) / scales.length : 1;

    let minY = Infinity;
    this.people.forEach((mannequin, slot) => {
      const person = people.find((p) => p.slot === slot);
      if (!person) {
        mannequin.hide();
        return;
      }
      const img = person.image;
      const hipX = (img[L.leftHip].x + img[L.rightHip].x) / 2;
      const hipY = (img[L.leftHip].y + img[L.rightHip].y) / 2;
      const offset = new THREE.Vector3((hipX - 0.5) * aspect * mpu, -(hipY - 0.5) * mpu, 0);
      // 예측으로 보여 주는 선수는 흐리게
      const opacity = (options.opacity ?? 1) * (person.predicted ? PREDICTED_OPACITY : 1);
      minY = Math.min(minY, mannequin.update(person.world, offset, { ...options, opacity }));
    });
    if (Number.isFinite(minY)) this.grid.position.y = minY;
    this.render();
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return; // 숨겨진 동안은 건너뛴다
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.observer.disconnect();
    this.controls.dispose();
    for (const m of this.people) m.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
