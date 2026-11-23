// Design Ref: §5.3 Stage3D — three.js 장면, 캐릭터 2명, 카메라 (PLAN 작업 8)
// 화면(React)과 분리한 3D 엔진. 다음 작업(체형·동작·화살표·부위 색)은 이 클래스의 선수(뼈대)를 받아 쓴다.
// DESIGN §10: 3D 코드는 계산 결과를 받아 그리기만 하고, 숫자를 새로 만들지 않는다.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import modelsJson from "@/public/models/models.json";
import { MODEL_KEY, type BodyShape, type ModelsJson } from "@/lib/motion/bodyShape";
import { smoothStep } from "@/lib/motion/path";
import type { BodyPart, FighterId, JointLockId, PartLoad, Sex } from "@/lib/types";
import { colorOfStep } from "./loadColors";
import { ArrowLayer } from "./arrows";
import { JointArrow, poseJointLock } from "./jointLockPose";
import { FighterRig } from "./fighterRig";
import { poseAttacker, poseDefenderFor, prepareStrike, type ActiveStrike, type StrikeRequest } from "./strikePlayer";

/** 캐릭터 치수 (키·팔 길이·체형별 부피·부위 위치) */
export const MODELS = modelsJson as unknown as ModelsJson;

/** 재생 상태 알림 */
export interface PlaybackEvents {
  /** 타격 하나가 시작될 때 (index = 연타 안 순서) */
  onStart?: (strike: ActiveStrike, index: number) => void;
  /** 닿는 순간 (타격마다 한 번) */
  onContact?: (strike: ActiveStrike, index: number) => void;
  /** 재생이 끝났을 때 */
  onEnd?: (strike: ActiveStrike) => void;
}

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
  private readonly rigs = new Map<FighterId, FighterRig>();
  private readonly arrows: ArrowLayer;
  private readonly jointArrow: JointArrow;
  /** 관절기 보기 상태 (PLAN 작업 19) */
  private jointLock: { attacker: FighterId; lock: JointLockId; angleDeg: number; over: boolean } | null = null;
  private jointArrowFor: object | null = null;
  private strike: ActiveStrike | null = null;
  private events: PlaybackEvents = {};
  /** 차례로 재생할 타격들 (단타는 하나) */
  private queue: StrikeRequest[] = [];
  private queueIndex = 0;
  private rate = 0.25;
  private paused = false;
  /** 준비 시간 동안 옮길 두 선수 거리 */
  private distanceMove: { from: number; to: number } | null = null;
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
    this.arrows = new ArrowLayer(this.scene);
    this.jointArrow = new JointArrow(this.scene);
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
        // 부위 색칠(PLAN 작업 18)은 선수마다 따로 해야 하므로 모양·재질을 복사해 같은 성별 두 선수가 나눠 쓰지 않게 한다
        mesh.geometry = mesh.geometry.clone();
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
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
    // 뼈 장치는 원점·쉬는 자세에서 만든다 (부위 위치 찾기)
    this.rigs.set(id, new FighterRig(fighter, MODELS[MODEL_KEY[sex]]));
    this.strike = null;
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
    this.rigs.delete(f.id);
    this.scene.remove(f.root);
    f.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // 발밑 고리와, 선수마다 복사한 캐릭터 모양·재질을 메모리에서 지운다 (그림·텍스처 원본은 다른 선수와 함께 쓰므로 두고)
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      }
    });
    this.fighters.delete(f.id);
  }

  getFighter(id: FighterId): StageFighter | undefined {
    return this.fighters.get(id);
  }

  /**
   * 관절기 보기 (PLAN 작업 19). 당하는 선수의 팔다리를 그 관절기 자세로 놓고 각도만큼 꺾는다.
   * over = 정상 범위를 넘었는가 (회전 화살표 색). null이면 끈다. 재생을 시작하면 자동으로 꺼진다.
   */
  showJointLock(lock: { attacker: FighterId; lock: JointLockId; angleDeg: number; over: boolean } | null) {
    this.jointLock = lock;
    if (lock) {
      this.strike = null;
      this.queue = [];
      this.setDistance(1.3);
    } else {
      this.jointArrow.clear();
    }
  }

  /** 부위별 누적 충격 색 칠하기 (PLAN 작업 18). 계산은 lib/lab/accumulate.ts가 한다 */
  setPartLoads(id: FighterId, loads: PartLoad[]) {
    const rig = this.rigs.get(id);
    if (!rig) return;
    const colors: Partial<Record<BodyPart, THREE.Color>> = {};
    for (const l of loads) {
      const c = colorOfStep(l.colorStep);
      if (c) colors[l.part] = new THREE.Color(c);
    }
    rig.setPartColors(colors);
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
    for (const f of this.fighters.values()) f.root.updateMatrixWorld(true);
  }

  getDistance(): number {
    return this.distanceM;
  }

  // ── 동작 재생 (PLAN 작업 11·14·17) ──

  /** 재생 알림 받기 */
  setPlaybackEvents(events: PlaybackEvents) {
    this.events = events;
  }

  /** 타격 하나를 준비한다 (거리 맞춤 포함). 준비 전 거리를 기억해 두고 준비 시간 동안 천천히 옮긴다 */
  private prepare(req: StrikeRequest): ActiveStrike | null {
    const attacker = this.rigs.get(req.attacker);
    const defender = this.rigs.get(req.attacker === "A" ? "B" : "A");
    if (!attacker || !defender) return null;
    const from = this.distanceM;
    const strike = prepareStrike(req, attacker, defender, () => this.distanceM, (d) => this.setDistance(d), this.rate);
    this.distanceMove = { from, to: this.distanceM };
    return strike;
  }

  /**
   * 타격 하나 재생 (펀치·킥·팔꿈치·무릎). rate는 재생 속도 배율 (1 = 원래 속도, 0.25 = 4배 느리게).
   * 두 선수 거리를 끝점이 닿을 만큼 맞춘 뒤 처음부터 재생한다.
   */
  playStrike(req: StrikeRequest, rate = this.rate): ActiveStrike | null {
    return this.playSequence([req], rate);
  }

  /** 여러 타격을 차례로 재생한다 (연타, PLAN 작업 17). 첫 타격을 돌려준다 */
  playSequence(reqs: StrikeRequest[], rate = this.rate): ActiveStrike | null {
    this.rate = rate;
    this.queue = [...reqs];
    this.queueIndex = 0;
    this.paused = false;
    this.arrows.clear();
    this.jointLock = null;
    this.jointArrow.clear();
    this.strike = reqs.length > 0 ? this.prepare(reqs[0]) : null;
    if (this.strike) this.events.onStart?.(this.strike, 0);
    return this.strike;
  }

  /** 마지막으로 재생한 것을 처음부터 다시 */
  replay(): ActiveStrike | null {
    return this.queue.length > 0 ? this.playSequence(this.queue, this.rate) : null;
  }

  /** 재생 속도 배율 바꾸기 (재생 중에도) */
  setRate(rate: number) {
    this.rate = rate;
    if (this.strike) this.strike.rate = rate;
  }

  /** 일시정지 / 이어서 재생 */
  setPaused(paused: boolean) {
    this.paused = paused;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** 지금 재생 중인 타격 */
  get activeStrike(): ActiveStrike | null {
    return this.strike;
  }

  /** 매 장면: 모든 선수를 쉬는 자세로 되돌린 뒤 가드, 재생 중이면 공격자·방어자 동작 */
  private poseFighters(dt: number) {
    const s = this.strike;
    if (s) {
      const before = s.time;
      if (!this.paused) s.time = Math.min(s.motion.timing.total, s.time + dt * s.rate);
      const contactTime = s.motion.timing.contactTime;
      if (!s.contacted && before <= contactTime && s.time >= contactTime) {
        s.time = contactTime; // 닿는 장면을 반드시 한 번 그린다
        s.contacted = true;
        this.events.onContact?.(s, this.queueIndex);
        // 닿는 순간 진행 방향 화살표 (PLAN 작업 15)
        this.arrows.add(s.contactPoint, s.contactDir, s.request.speedMps, s.hitPart !== s.request.target);
      }
      // 준비 시간 동안 두 선수 거리를 이전 거리에서 이번 거리로 천천히 옮긴다
      if (this.distanceMove) {
        const k = smoothStep(s.time / s.motion.timing.pre);
        const { from, to } = this.distanceMove;
        this.distanceM = from + (to - from) * k;
        this.placeFighters();
        if (k >= 1) this.distanceMove = null;
      }
    }
    for (const [id, rig] of this.rigs) {
      rig.beginFrame();
      if (s && s.request.attacker === id) {
        const reached = poseAttacker(s, rig);
        if (s.contacted && s.time === s.motion.timing.contactTime) s.reached = reached;
      } else if (s) {
        // 재생 중 맞는 선수: 수비에 맞춘 자세 (맞음 = 가드 내림, 막음 = 아래팔·정강이로 막기)
        poseDefenderFor(s.request, rig);
      } else if (this.jointLock && this.jointLock.attacker !== id) {
        // 관절기를 당하는 선수 (PLAN 작업 19)
        const arc = poseJointLock(rig, this.jointLock.lock, this.jointLock.angleDeg);
        if (this.jointArrowFor !== this.jointLock) {
          this.jointArrow.show(arc, 0.14 * rig.scale, this.jointLock.over); // 설정이 바뀔 때만 다시 그린다
          this.jointArrowFor = this.jointLock;
        }
      } else {
        rig.setTwist(0);
        rig.guard();
      }
    }
    if (s && s.time >= s.motion.timing.total) {
      // 다음 타격이 있으면 이어서, 없으면 끝
      this.queueIndex++;
      if (this.queueIndex < this.queue.length) {
        this.strike = this.prepare(this.queue[this.queueIndex]);
        if (this.strike) this.events.onStart?.(this.strike, this.queueIndex);
      } else {
        this.strike = null;
        this.events.onEnd?.(s);
      }
    }
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

  /** 지금 장면을 그림(PNG 데이터 주소)으로 — PDF 보고서용 (PLAN 작업 21) */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
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
    this.poseFighters(dt);
    this.arrows.update(this.paused ? 0 : dt); // 일시정지 중에는 화살표를 그대로 둔다
    for (const cb of this.frameCallbacks) cb(dt, now);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.frameCallbacks.clear();
    this.arrows.clear();
    for (const f of [...this.fighters.values()]) this.removeFighter(f);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
