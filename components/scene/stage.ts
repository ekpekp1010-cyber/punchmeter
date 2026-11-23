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
import { isMoveStep } from "@/lib/lab/combo";
import type { BodyPart, FighterId, GloveOz, JointLockId, MoveStep, PartLoad, Sex } from "@/lib/types";
import { colorOfStep } from "./loadColors";
import { ArrowLayer } from "./arrows";
import { JointArrow, poseJointLock } from "./jointLockPose";
import { FighterRig, type PoseSnapshot } from "./fighterRig";
import {
  LINK_BLEND_S,
  poseAttacker,
  poseDefenderFor,
  prepareStrike,
  type ActiveStrike,
  type StrikeRequest,
} from "./strikePlayer";

/** 캐릭터 치수 (키·팔 길이·체형별 부피·부위 위치) */
export const MODELS = modelsJson as unknown as ModelsJson;

/** 재생 상태 알림 */
export interface PlaybackEvents {
  /** 타격·움직임 하나가 시작될 때 (index = 연타 목록 안 순서) */
  onStart?: (index: number) => void;
  /** 닿는 순간 (타격마다 한 번, index = 연타 목록 안 순서) */
  onContact?: (strike: ActiveStrike, index: number) => void;
  /** 재생이 끝났을 때 */
  onEnd?: () => void;
}

/** 연타 목록 한 칸 (재생용): 타격 또는 움직임(빽스텝) */
export type StageItem = StrikeRequest | MoveStep;

/** 빽스텝: 뒤로 물러나는 거리(m, 기본 체형 기준)와 걸리는 시간(동작 시간, 초) — 그림용 값 */
export const BACK_STEP = { distanceM: 0.3, durationS: 0.45 };

/** 재생 중인 움직임 */
interface ActiveMove {
  item: MoveStep;
  time: number;
  total: number;
}

/** 두 선수 사이 거리·가운데 자리를 옮기는 중 (stepper = 발을 떼어 걷는 선수, 없으면 미끄러지듯 옮김) */
interface DistanceMove {
  from: number;
  to: number;
  centerFrom: number;
  centerTo: number;
  stepper: FighterId | null;
}

/** 거리 d, 가운데 c일 때 선수의 x 자리 (A는 왼쪽, B는 오른쪽) */
function fighterX(id: FighterId, d: number, c: number): number {
  return id === "A" ? c - d / 2 : c + d / 2;
}

/** 선수 fixed를 제자리에 둔 채 거리를 dTo로 바꿀 때의 가운데 자리 */
function centerKeeping(fixed: FighterId, dFrom: number, cFrom: number, dTo: number): number {
  const x = fighterX(fixed, dFrom, cFrom);
  return fixed === "A" ? x + dTo / 2 : x - dTo / 2;
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
  /** 선수마다 마지막으로 고른 성별 (setFighter 순서가 뒤바뀌어도 마지막 것만 반영) */
  private readonly wantedSex = new Map<FighterId, Sex>();
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
  /** 차례로 재생할 타격·움직임들 (단타는 하나) */
  private queue: StageItem[] = [];
  private queueIndex = 0;
  /** 재생 중인 움직임 (빽스텝) */
  private move: ActiveMove | null = null;
  /** 두 선수 가운데 자리(x, m) — 빽스텝·앞스텝으로 한 선수만 움직이면 바뀐다 */
  private centerX = 0;
  private rate = 0.25;
  private paused = false;
  /** 준비 시간(움직임이면 그 시간) 동안 옮길 두 선수 거리·가운데 자리 */
  private distanceMove: DistanceMove | null = null;
  /** 두 선수 가드를 좁히는 정도 (마지막 타격에서 정한 값, 0~1) */
  private idleGuardTight = 0;
  /** 평소 통통 튀기용 시계(초, 실제 시간) */
  private idleClock = 0;
  /** 이번 타격이 시작될 때의 가드 좁히기 (여기서 이번 값으로 천천히 옮긴다) */
  private fromGuardTight = 0;
  /** 동작이 바뀔 때 이전 자세에서 새 자세로 섞기 (선수별 기억한 자세, 지난 시간) */
  private blend: { from: Map<FighterId, PoseSnapshot>; t: number } | null = null;
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
  async setFighter(id: FighterId, sex: Sex): Promise<StageFighter | undefined> {
    // 마지막으로 고른 성별을 기억한다. 캐릭터 파일을 내려받는 동안 성별을 다시 바꾸면,
    // 늦게 도착한 이전 성별 캐릭터가 새로 고른 캐릭터를 덮어쓰지 않게 한다
    this.wantedSex.set(id, sex);
    const current = this.fighters.get(id);
    if (current && current.sex === sex) return current;

    const template = await this.template(sex);
    if (this.disposed) throw new Error("무대가 이미 닫혔습니다");
    if (this.wantedSex.get(id) !== sex) return this.fighters.get(id); // 그사이 다른 성별을 골랐다
    // 기다리는 동안 바뀌었을 수 있으니 지금 서 있는 선수를 다시 본다
    const existing = this.fighters.get(id);
    if (existing && existing.sex === sex) return existing;
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
    // 서로 상대를 알려 준다 (가까이 붙으면 가드를 좁히는 데 씀)
    const a = this.rigs.get("A");
    const b = this.rigs.get("B");
    if (a && b) {
      a.opponent = b;
      b.opponent = a;
    }
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
    this.idleGuardTight = 0;
    if (lock) {
      this.strike = null;
      this.move = null;
      this.queue = [];
      this.distanceMove = null;
      this.centerX = 0;
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

  /** 선수 손에 글러브를 끼운다 (oz별 크기, 0 = 맨손). 색은 선수 색 */
  setGlove(id: FighterId, oz: GloveOz) {
    this.rigs.get(id)?.setGlove(oz, id);
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
    const centerFrom = this.centerX;
    const link = { hasPrev: this.queueIndex > 0, hasNext: this.queueIndex < this.queue.length - 1 };
    const strike = prepareStrike(req, attacker, defender, () => this.distanceM, (d) => this.setDistance(d), this.rate, link);
    const to = this.distanceM;
    const prev = this.queueIndex > 0 ? this.queue[this.queueIndex - 1] : null;
    if (prev && isMoveStep(prev)) {
      // 빽스텝 다음 타격: 맞는 선수는 제자리, 때리는 선수가 걸어 들어가 거리를 맞춘다 (사용자 요청)
      const defenderId: FighterId = req.attacker === "A" ? "B" : "A";
      this.distanceMove = { from, to, centerFrom, centerTo: centerKeeping(defenderId, from, centerFrom, to), stepper: req.attacker };
    } else {
      // 처음 타격은 무대 가운데로 돌아오고, 타격끼리는 두 선수가 반씩 옮긴다 (전과 같음)
      this.distanceMove = { from, to, centerFrom, centerTo: prev ? centerFrom : 0, stepper: null };
    }
    return strike;
  }

  /** 움직임(빽스텝) 시작: 움직이는 선수만 뒤로 한 걸음, 상대는 제자리 */
  private startMove(item: MoveStep) {
    const other: FighterId = item.fighter === "A" ? "B" : "A";
    const scale = this.rigs.get(item.fighter)?.scale ?? 1;
    const from = this.distanceM;
    const to = from + BACK_STEP.distanceM * scale;
    const centerTo = centerKeeping(other, from, this.centerX, to);
    this.distanceMove = { from, to, centerFrom: this.centerX, centerTo, stepper: item.fighter };
    this.move = { item, time: 0, total: BACK_STEP.durationS };
  }

  /** 목록의 지금 칸(queueIndex)을 시작한다 */
  private startItem() {
    const item = this.queue[this.queueIndex];
    if (isMoveStep(item)) this.startMove(item);
    else this.strike = this.prepare(item);
    this.events.onStart?.(this.queueIndex);
  }

  /** 지금 칸이 끝났다: 지금 자세를 기억해 두고 다음 칸으로, 없으면 끝 */
  private advance() {
    this.startBlend();
    this.fromGuardTight = this.idleGuardTight;
    this.strike = null;
    this.move = null;
    this.queueIndex++;
    if (this.queueIndex < this.queue.length) this.startItem();
    else this.events.onEnd?.();
  }

  /**
   * 타격 하나 재생 (펀치·킥·팔꿈치·무릎). rate는 재생 속도 배율 (1 = 원래 속도, 0.25 = 4배 느리게).
   * 두 선수 거리를 끝점이 닿을 만큼 맞춘 뒤 처음부터 재생한다.
   */
  playStrike(req: StrikeRequest, rate = this.rate): boolean {
    return this.playSequence([req], rate);
  }

  /** 여러 타격·움직임을 차례로 재생한다 (연타, PLAN 작업 17). 시작했으면 true */
  playSequence(reqs: StageItem[], rate = this.rate): boolean {
    this.rate = rate;
    this.queue = [...reqs];
    this.queueIndex = 0;
    this.paused = false;
    this.arrows.clear();
    this.jointLock = null;
    this.jointArrow.clear();
    this.startBlend(); // 지금 보이는 자세에서 부드럽게 시작 (준비 계산이 뼈를 움직이기 전에 기억)
    this.fromGuardTight = this.idleGuardTight;
    this.strike = null;
    this.move = null;
    if (reqs.length === 0) return false;
    this.startItem();
    return true;
  }

  /** 마지막으로 재생한 것을 처음부터 다시 */
  replay(): boolean {
    return this.queue.length > 0 ? this.playSequence(this.queue, this.rate) : false;
  }

  /** 재생 중인가 (타격 또는 움직임) */
  get isPlaying(): boolean {
    return this.strike !== null || this.move !== null;
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

  /** 지금 보이는 두 선수 자세를 기억해, 다음 몇 장면 동안 여기서 새 자세로 섞는다 */
  private startBlend() {
    const from = new Map<FighterId, PoseSnapshot>();
    for (const [id, rig] of this.rigs) from.set(id, rig.snapshotPose());
    this.blend = { from, t: 0 };
  }

  /**
   * 매 장면: 시간을 진행하고(타격이 끝났으면 다음 타격으로 넘긴 뒤), 모든 선수를 쉬는 자세로 되돌려
   * 가드, 재생 중이면 공격자·방어자 동작을 놓는다. 동작이 막 바뀌었으면 이전 자세에서 섞는다.
   * 다음 타격 준비(prepareStrike)는 뼈를 시험 삼아 움직이므로, 반드시 자세를 놓기 전에 한다
   * (뒤에 하면 다음 타격의 뻗은 자세가 한 장면 보여 "동작을 한 번 더 하는" 것처럼 보였다).
   */
  private poseFighters(dt: number) {
    const step = this.paused ? 0 : dt * this.rate;
    this.idleClock += dt;
    let s = this.strike;
    if (s) {
      const before = s.time;
      s.time = Math.min(s.motion.timing.total, s.time + step);
      const contactTime = s.motion.timing.contactTime;
      if (!s.contacted && before <= contactTime && s.time >= contactTime) {
        s.time = contactTime; // 닿는 장면을 반드시 한 번 그린다
        s.contacted = true;
        this.events.onContact?.(s, this.queueIndex);
        // 닿는 순간 진행 방향 화살표 (PLAN 작업 15)
        this.arrows.add(s.contactPoint, s.contactDir, s.request.speedMps, s.hitPart !== s.request.target);
      } else if (s.time >= s.motion.timing.total) {
        this.advance(); // 끝: 다음 칸이 있으면 이어서, 없으면 가드로
      }
    } else if (this.move) {
      this.move.time = Math.min(this.move.total, this.move.time + step);
      if (this.move.time >= this.move.total) this.advance();
    }
    s = this.strike;
    const m = this.move;
    // 거리·가운데 자리 옮기기 진행 정도: 타격은 준비 시간 동안, 움직임(빽스텝)은 그 시간 내내
    const k = s ? smoothStep(Math.min(1, s.time / s.motion.timing.pre)) : m ? smoothStep(m.time / m.total) : 1;
    const dm = s || m ? this.distanceMove : null;
    if (dm) {
      this.distanceM = dm.from + (dm.to - dm.from) * k;
      this.centerX = dm.centerFrom + (dm.centerTo - dm.centerFrom) * k;
      this.placeFighters();
    }
    // 걷는 선수가 지금 발을 옮기는 중인가 (타격이면 준비 시간 동안만)
    const stepping = dm && dm.stepper && k < 1 && (m || (s && s.time < s.motion.timing.pre)) ? dm : null;
    if (s) {
      // 겹침 막기용 가드 좁히기: 준비 시간 동안 이전 값에서 이번 값으로 옮기고, 끝나도 다음 타격 전까지 유지한다
      this.idleGuardTight = this.fromGuardTight + (s.guardTight - this.fromGuardTight) * k;
    }
    for (const [id, rig] of this.rigs) {
      rig.guardTightMin = this.idleGuardTight;
      rig.beginFrame();
      if (s && s.request.attacker === id) {
        const reached = poseAttacker(s, rig);
        if (s.contacted && s.time === s.motion.timing.contactTime) s.reached = reached;
      } else if (s) {
        // 재생 중 맞는 선수: 수비에 맞춘 자세 (맞음 = 가드 내림, 막음 = 아래팔·정강이로 막기)
        poseDefenderFor(s.request, rig);
      } else if (m) {
        // 빽스텝 중: 두 선수 모두 가드 (움직이는 선수의 발은 아래에서 한 발씩 옮긴다)
        rig.setTwist(0);
        rig.guard();
      } else if (this.jointLock && this.jointLock.attacker !== id) {
        // 관절기를 당하는 선수 (PLAN 작업 19)
        const arc = poseJointLock(rig, this.jointLock.lock, this.jointLock.angleDeg);
        if (this.jointArrowFor !== this.jointLock) {
          this.jointArrow.show(arc, 0.14 * rig.scale, this.jointLock.over); // 설정이 바뀔 때만 다시 그린다
          this.jointArrowFor = this.jointLock;
        }
      } else {
        // 평소: 제자리에서 아주 살짝 통통 튄다 (두 선수 박자를 조금 어긋나게). 재생 속도와 상관없이 실제 시간으로
        rig.idleBounce(this.idleClock + (id === "B" ? 0.13 : 0));
        rig.setTwist(0);
        rig.guard();
      }
      if (stepping && stepping.stepper === id) {
        const dx = fighterX(id, stepping.to, stepping.centerTo) - fighterX(id, stepping.from, stepping.centerFrom);
        if (Math.abs(dx) > 0.01) rig.stepFeet(new THREE.Vector3(dx, 0, 0), k);
      }
    }
    if (dm && k >= 1) this.distanceMove = null;
    // 동작이 바뀐 직후: 이전 자세 → 새 자세로 섞는다 (준비 시간 안에 끝나므로 닿는 순간 자세·속도는 그대로)
    if (this.blend) {
      this.blend.t += step;
      const w = smoothStep(Math.min(1, this.blend.t / LINK_BLEND_S));
      for (const [id, rig] of this.rigs) {
        const snap = this.blend.from.get(id);
        if (snap) rig.blendFromSnapshot(snap, w);
      }
      if (w >= 1) this.blend = null;
    }
  }

  private placeFighters() {
    const a = this.fighters.get("A");
    const b = this.fighters.get("B");
    if (a) {
      a.root.position.set(fighterX("A", this.distanceM, this.centerX), 0, 0);
      a.root.rotation.y = Math.PI / 2; // +Z를 보던 캐릭터를 +X 쪽으로
    }
    if (b) {
      b.root.position.set(fighterX("B", this.distanceM, this.centerX), 0, 0);
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
