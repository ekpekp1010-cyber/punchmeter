// Design Ref: §5.3 Stage3D — three.js 장면, 캐릭터 2명, 카메라 (PLAN 작업 8)
// 화면(React)과 분리한 3D 엔진. 다음 작업(체형·동작·화살표·부위 색)은 이 클래스의 선수(뼈대)를 받아 쓴다.
// DESIGN §10: 3D 코드는 계산 결과를 받아 그리기만 하고, 숫자를 새로 만들지 않는다.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import modelsJson from "@/public/models/models.json";
import type { BodyShape, ModelsJson } from "@/lib/motion/bodyShape";

/** 캐릭터 치수 (키·팔 길이·체형별 부피) */
export const MODELS = modelsJson as ModelsJson;
import type { FighterId, Sex } from "@/lib/types";

/** 성별마다 쓰는 캐릭터 파일 (scripts/blender/make_fighters.py로 만듦, 치수는 models.json) */
export const MODEL_FILES: Record<Sex, string> = {
  male: MODELS.fighter_male.file,
  female: MODELS.fighter_female.file,
};

/** 선수 표시 색 (발밑 고리) */
export const FIGHTER_COLORS: Record<FighterId, number> = { A: 0xef4444, B: 0x3b82f6 };

/** 기본 선수 간격(m). 기술이 닿을 만큼 맞추는 일은 동작 작업(PLAN 작업 11~13)에서 한다 */
export const DEFAULT_DISTANCE_M = 1.1;

/** 무대 위 선수 하나 */
export interface StageFighter {
  id: FighterId;
  sex: Sex;
  /** 선수 전체를 옮기고 돌리는 묶음 (발 가운데가 원점) */
  root: THREE.Group;
  /** 캐릭터 모델 (root 안) */
  model: THREE.Object3D;
  /** 뼈 이름(upperarm_r, lowerarm_r, thigh_l …) → 뼈 */
  bones: Map<string, THREE.Bone>;
  /** 캐릭터 메시들 (부위 색칠용) */
  meshes: THREE.SkinnedMesh[];
}

export type FrameCallback = (dtSec: number, nowSec: number) => void;

/** WebGL을 쓸 수 있는지 미리 확인한다 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly container: HTMLElement;
  private readonly loader = new GLTFLoader();
  /** 성별마다 한 번만 내려받은 원본 (같은 성별 두 선수는 복제해서 쓴다) */
  private readonly templates = new Map<Sex, Promise<THREE.Object3D>>();
  private readonly fighters = new Map<FighterId, StageFighter>();
  private readonly frameCallbacks = new Set<FrameCallback>();
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private lastTime = 0;
  private distanceM = DEFAULT_DISTANCE_M;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1f2430);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
    this.camera.position.set(0, 1.45, 4.6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.0, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 10;
    this.controls.maxPolarAngle = Math.PI * 0.49; // 바닥 아래로 내려가지 않게
    this.controls.update();

    this.buildEnvironment();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** 조명과 바닥 */
  private buildEnvironment() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2.5, 5, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -3;
    sun.shadow.camera.right = 3;
    sun.shadow.camera.top = 3;
    sun.shadow.camera.bottom = -3;
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4, 64),
      new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private template(sex: Sex): Promise<THREE.Object3D> {
    let p = this.templates.get(sex);
    if (!p) {
      p = this.loader.loadAsync(MODEL_FILES[sex]).then((gltf) => gltf.scene);
      this.templates.set(sex, p);
    }
    return p;
  }

  /**
   * 선수를 무대에 세운다. 이미 같은 성별로 서 있으면 그대로 둔다.
   * A는 왼쪽에서 오른쪽(+X)을, B는 오른쪽에서 왼쪽(-X)을 바라본다.
   */
  async setFighter(id: FighterId, sex: Sex): Promise<StageFighter> {
    const existing = this.fighters.get(id);
    if (existing && existing.sex === sex) return existing;

    const template = await this.template(sex);
    if (this.disposed) throw new Error("무대가 이미 닫혔습니다");
    if (existing) this.removeFighter(existing);

    const model = cloneSkinned(template);
    const bones = new Map<string, THREE.Bone>();
    const meshes: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = o as THREE.SkinnedMesh;
        mesh.castShadow = true;
        mesh.frustumCulled = false; // 동작 중 팔다리가 원래 경계 밖으로 나가도 사라지지 않게
        meshes.push(mesh);
      }
    });

    const root = new THREE.Group();
    root.name = `fighter_${id}`;
    root.add(model);
    root.add(this.makeRing(FIGHTER_COLORS[id]));
    this.scene.add(root);

    const fighter: StageFighter = { id, sex, root, model, bones, meshes };
    this.fighters.set(id, fighter);
    this.placeFighters();
    return fighter;
  }

  /** 발밑 색 고리 (A 빨강, B 파랑) */
  private makeRing(color: number): THREE.Mesh {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.34, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    ring.name = "ring";
    return ring;
  }

  private removeFighter(f: StageFighter) {
    this.scene.remove(f.root);
    f.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name === "ring") {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.fighters.delete(f.id);
  }

  getFighter(id: FighterId): StageFighter | undefined {
    return this.fighters.get(id);
  }

  /**
   * 선수 체형 적용 (PLAN 작업 9): 전체 크기, 모양 변형(마름·무거움·근육형) 섞기, 위팔 뼈 배율(리치).
   * 모양 값은 lib/motion/bodyShape.ts가 계산한다.
   */
  applyShape(id: FighterId, shape: BodyShape) {
    const f = this.fighters.get(id);
    if (!f) return;
    f.model.scale.setScalar(shape.scale);
    for (const mesh of f.meshes) {
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (!dict || !influences) continue;
      for (const [name, amount] of Object.entries(shape.morph)) {
        const index = dict[name];
        if (index !== undefined) influences[index] = amount;
      }
    }
    for (const name of ["upperarm_l", "upperarm_r"]) f.bones.get(name)?.scale.setScalar(shape.armScale);
  }

  /** 두 선수 사이 거리(m, 발 가운데끼리) */
  setDistance(distanceM: number) {
    this.distanceM = distanceM;
    this.placeFighters();
  }

  private placeFighters() {
    const half = this.distanceM / 2;
    const a = this.fighters.get("A");
    const b = this.fighters.get("B");
    if (a) {
      a.root.position.set(-half, 0, 0);
      a.root.rotation.y = Math.PI / 2; // +Z를 보던 캐릭터를 +X 쪽으로
    }
    if (b) {
      b.root.position.set(half, 0, 0);
      b.root.rotation.y = -Math.PI / 2;
    }
  }

  /** 매 장면 호출할 함수 등록 (동작 재생용). 돌려받은 함수로 해제한다 */
  onFrame(cb: FrameCallback): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  /** 시점을 처음 위치로 */
  resetView() {
    this.camera.position.set(0, 1.45, 4.6);
    this.controls.target.set(0, 1.0, 0);
    this.controls.update();
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private tick = (nowMs: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const now = nowMs / 1000;
    const dt = this.lastTime === 0 ? 0 : Math.min(0.1, now - this.lastTime);
    this.lastTime = now;
    for (const cb of this.frameCallbacks) cb(dt, now);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.frameCallbacks.clear();
    for (const f of [...this.fighters.values()]) this.removeFighter(f);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
