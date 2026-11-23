// Design Ref: §3 데이터 흐름 ③ 선수 추적 — PLAN 작업 8(선수 추적)의 바탕을 앞당겨 만든다.
// 1) 장면마다 찾은 사람을 "같은 선수"끼리 이어 붙여 색(A=빨강, B=파랑)이 바뀌지 않게 한다.
// 2) 선수끼리 겹쳐 한 명이 안 보이면 지우지 않고, 마지막 자세를 유지한 채 움직이던 방향으로 위치를 예측해 보여 준다.
// 3) 무릎 아래가 화면 밖으로 잘리면 도구가 지어낸 굽은 다리 대신, 최근에 보였던 다리 모양(없으면 곧게 편 다리)으로 채운다.
// 예측·채운 값은 그림용이다. 계산(속도·힘)에서는 "측정 불가"로 다뤄야 하므로 predicted·estimatedJoints로 표시해 둔다.

import type { PoseLandmark } from "../types";
import { segmentParam } from "../physics/body";
import { LANDMARK as L } from "./landmarks";
import type { CameraPoint } from "./cameraModel";

/** 이 값 이상이어야 "보이는 관절"로 믿는다 */
export const RELIABLE_VISIBILITY = 0.5;
/** 이 값 이상이어야 "화면 안에 있는 관절"로 믿는다 */
export const RELIABLE_PRESENCE = 0.5;
/** 화면 가장자리 여유 (화면 너비·높이 비율) */
const FRAME_MARGIN = 0.02;
/** 채워 넣은 관절에 붙이는 보이는 정도 (흐리게 그려지고, 계산에서는 믿지 않는 값) */
export const ESTIMATED_VISIBILITY = 0.15;
/** 따라갈 선수 수 */
export const MAX_TRACKS = 2;
/** 같은 선수로 이어 붙일 최대 거리 (몸통 길이의 배수) */
const GATE_TORSO = 1.5;
/** 안 보인 시간이 길수록 이어 붙일 거리를 넓힌다 (몸통 길이/초) */
const GATE_GROWTH_TORSO_PER_SEC = 3;
/** 몸 크기 차이를 거리로 얼마나 치는지 (크기가 e배 다르면 몸통 길이 2배만큼 떨어진 것과 같게 본다) */
const SIZE_WEIGHT = 2;
/** 화면 속 몸 크기가 이 이상 다르면(약 1.8배) 같은 선수로 보지 않는다 (ln 값) */
const MAX_SIZE_GAP = Math.log(1.8);
/** 안 보인 시간이 길수록 크기 차이 허용도 넓힌다 (몸을 크게 웅크렸다 펴는 경우 대비, ln 값/초) */
const SIZE_GATE_GROWTH_PER_SEC = 0.5;
/** 예측 이동이 줄어드는 시간 (초). 안 보인 지 이만큼 지나면 거의 멈춘 것으로 본다 */
const VELOCITY_TAU_SEC = 0.4;
/** 예측 속도 상한 (화면 높이/초). 안 보이는 동안 예측으로 옮기는 거리는 최대 이 값 × 0.4초 */
const MAX_SPEED = 1;
/** 장면 사이가 이보다 벌어지거나 뒤로 감으면 추적을 처음부터 다시 한다 (초) */
const RESET_GAP_SEC = 1;

/** 관절 찾기 도구가 한 사람에 대해 준 결과 */
export interface PoseDetection {
  /** 화면 기준 위치 (0~1) */
  image: PoseLandmark[];
  /** 실제 크기 3D 위치 (m, 엉덩이 가운데가 원점, y는 아래쪽이 +) */
  world: PoseLandmark[];
}

/** 추적 결과: 선수 한 명 */
export interface TrackedPerson {
  /** 0 = 첫 번째 선수(빨강), 1 = 두 번째 선수(파랑). 영상 내내 바뀌지 않는다 */
  slot: number;
  image: PoseLandmark[];
  world: PoseLandmark[];
  /** 이번 장면에서 찾지 못해 예측으로 보여 주는 중인가 */
  predicted: boolean;
  /** 마지막으로 찾은 뒤 지난 시간 (초) */
  lostSec: number;
  /** 화면 밖이거나 안 보여서 채워 넣은 관절 번호 */
  estimatedJoints: number[];
  /** 3D 관절을 카메라 공간(원근 반영)으로 옮길 거리 (m). CameraPlacer가 채운다 */
  camera?: CameraPoint;
}

interface Vec2 {
  x: number;
  y: number;
}
interface Vec3 extends Vec2 {
  z: number;
}

interface Track {
  slot: number;
  image: PoseLandmark[];
  world: PoseLandmark[];
  /** 몸통 가운데 (x는 화면 높이 단위로 바꾼 값) */
  center: Vec2;
  /** 화면 속 몸통 길이 (화면 높이 단위) */
  size: number;
  velocity: Vec2;
  lastSeenSec: number;
  estimatedJoints: number[];
  /** 마지막으로 잘 보였을 때의 다리 모양 (관절 번호 → 윗관절에서 이 관절까지의 3D 거리) */
  legMemory: Map<number, Vec3>;
}

/** 믿을 만한 관절인가: 잘 보이고, 화면 안에 있다 */
export function isReliable(p: PoseLandmark | undefined): boolean {
  if (!p) return false;
  return (
    p.visibility >= RELIABLE_VISIBILITY &&
    (p.presence ?? 1) >= RELIABLE_PRESENCE &&
    p.x >= -FRAME_MARGIN &&
    p.x <= 1 + FRAME_MARGIN &&
    p.y >= -FRAME_MARGIN &&
    p.y <= 1 + FRAME_MARGIN
  );
}

const mid = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

/** 몸통 가운데와 길이 (화면 높이 단위). 어깨·엉덩이가 없으면 null */
function torsoOf(image: PoseLandmark[], aspect: number): { center: Vec2; size: number } | null {
  const ls = image[L.leftShoulder];
  const rs = image[L.rightShoulder];
  const lh = image[L.leftHip];
  const rh = image[L.rightHip];
  if (!ls || !rs || !lh || !rh) return null;
  const s = mid(ls, rs);
  const h = mid(lh, rh);
  const size = Math.hypot((s.x - h.x) * aspect, s.y - h.y);
  return { center: { x: ((s.x + h.x) / 2) * aspect, y: (s.y + h.y) / 2 }, size: Math.max(size, 0.02) };
}

/** 실제 몸통 길이 (m) */
function worldTorsoLength(world: PoseLandmark[]): number | null {
  const ls = world[L.leftShoulder];
  const rs = world[L.rightShoulder];
  const lh = world[L.leftHip];
  const rh = world[L.rightHip];
  if (!ls || !rs || !lh || !rh) return null;
  const s = mid(ls, rs);
  const h = mid(lh, rh);
  return Math.hypot(s.x - h.x, s.y - h.y, s.z - h.z);
}

/** 분절 길이 ÷ 몸통 길이 (de Leva 1996 남녀 평균. 그림용 다리 길이 어림에만 쓴다) */
function ratioToTrunk(segment: "thigh" | "shank" | "foot"): number {
  const avg = (s: "thigh" | "shank" | "foot" | "trunk") => {
    const { lengthMm } = segmentParam(s);
    return (lengthMm.male + lengthMm.female) / 2;
  };
  return avg(segment) / avg("trunk");
}

/** 다리 관절 사슬: 엉덩이 → 무릎 → 발목 → 발끝 */
const LEG_CHAINS = [
  [L.leftHip, L.leftKnee, L.leftAnkle, L.leftFootIndex],
  [L.rightHip, L.rightKnee, L.rightAnkle, L.rightFootIndex],
] as const;
const HEELS = [
  [L.leftAnkle, L.leftHeel],
  [L.rightAnkle, L.rightHeel],
] as const;

/** 다리를 본 적이 없을 때 쓰는 기본 모양: 곧게 선 다리 (y 아래가 +, 카메라 쪽이 -z) */
function defaultLegVector(joint: number, torsoM: number): Vec3 {
  switch (joint) {
    case L.leftKnee:
    case L.rightKnee:
      return { x: 0, y: torsoM * ratioToTrunk("thigh"), z: 0 };
    case L.leftAnkle:
    case L.rightAnkle:
      return { x: 0, y: torsoM * ratioToTrunk("shank"), z: 0 };
    case L.leftHeel:
    case L.rightHeel:
      return { x: 0, y: torsoM * 0.08, z: torsoM * 0.05 };
    default: // 발끝
      return { x: 0, y: torsoM * 0.08, z: -torsoM * ratioToTrunk("foot") * 0.75 };
  }
}

/**
 * 화면 밖이거나 안 보이는 다리 관절을 채운다.
 * 윗관절이 채워졌으면 아랫관절도 함께 채운다 (지어낸 무릎에 진짜 발목을 붙이지 않음).
 */
export function repairLegs(
  detection: PoseDetection,
  memory: Map<number, Vec3>,
  aspect: number,
): PoseDetection & { estimatedJoints: number[] } {
  const image = detection.image.map((p) => ({ ...p }));
  const world = detection.world.map((p) => ({ ...p }));
  const estimatedJoints: number[] = [];

  const torsoM = worldTorsoLength(world);
  const torsoImg = torsoOf(image, aspect);
  if (torsoM === null || torsoImg === null || torsoM < 1e-3) return { image, world, estimatedJoints };
  /** 화면 높이 1칸이 몇 m인가 */
  const metersPerUnit = torsoM / torsoImg.size;

  const fill = (parent: number, joint: number) => {
    const v = memory.get(joint) ?? defaultLegVector(joint, torsoM);
    const pw = world[parent];
    const pi = image[parent];
    world[joint] = { x: pw.x + v.x, y: pw.y + v.y, z: pw.z + v.z, visibility: ESTIMATED_VISIBILITY };
    image[joint] = {
      x: pi.x + v.x / (metersPerUnit * aspect),
      y: pi.y + v.y / metersPerUnit,
      z: pi.z + v.z / (metersPerUnit * aspect),
      visibility: ESTIMATED_VISIBILITY,
      presence: image[joint]?.presence,
    };
    estimatedJoints.push(joint);
  };
  const remember = (parent: number, joint: number) => {
    if (!isReliable(detection.image[parent])) return;
    const a = world[parent];
    const b = world[joint];
    memory.set(joint, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
  };

  LEG_CHAINS.forEach((chain, side) => {
    let parentFilled = false;
    for (let i = 1; i < chain.length; i++) {
      const parent = chain[i - 1];
      const joint = chain[i];
      if (!parentFilled && isReliable(detection.image[joint])) {
        remember(parent, joint);
        continue;
      }
      fill(parent, joint);
      parentFilled = true;
    }
    const [ankle, heel] = HEELS[side];
    if (estimatedJoints.includes(ankle) || !isReliable(detection.image[heel])) fill(ankle, heel);
    else remember(ankle, heel);
  });

  return { image, world, estimatedJoints };
}

/** 장면마다 찾은 사람들을 선수 2명으로 이어 붙이고, 안 보이는 선수는 예측해서 유지한다 */
export class PoseTracker {
  private tracks: Track[] = [];
  private lastTimeSec: number | null = null;

  /** @param aspect 영상의 가로÷세로 비율 */
  constructor(private aspect = 16 / 9) {}

  setAspect(aspect: number) {
    if (aspect > 0 && aspect !== this.aspect) {
      this.aspect = aspect;
      this.reset();
    }
  }

  reset() {
    this.tracks = [];
    this.lastTimeSec = null;
  }

  /**
   * @param detections 이번 장면에서 찾은 사람들 (최대 3명. 심판이 섞여 있을 수 있다)
   * @param timeSec 영상 속 시각 (초)
   */
  update(detections: PoseDetection[], timeSec: number): TrackedPerson[] {
    if (this.lastTimeSec !== null && (timeSec < this.lastTimeSec || timeSec - this.lastTimeSec > RESET_GAP_SEC)) {
      this.reset();
    }
    this.lastTimeSec = timeSec;

    const candidates = detections
      .map((d) => ({ d, torso: torsoOf(d.image, this.aspect) }))
      .filter((c): c is { d: PoseDetection; torso: { center: Vec2; size: number } } => c.torso !== null);

    // 1) 기존 선수와 이번에 찾은 사람을 짝짓는다 (전체 거리 합이 가장 작은 조합)
    const predictedCenters = this.tracks.map((t) => this.predictCenter(t, timeSec));
    const assignment = this.bestAssignment(predictedCenters, candidates.map((c) => c.torso), timeSec);
    const used = new Set<number>();
    this.tracks.forEach((track, i) => {
      const k = assignment[i];
      if (k < 0) return;
      used.add(k);
      this.apply(track, candidates[k].d, candidates[k].torso, timeSec);
    });

    // 2) 아직 2명이 안 채워졌으면 짝 없는 사람 중 큰 사람(카메라에 가까운 선수)부터 새 선수로 등록
    const leftovers = candidates
      .map((c, k) => ({ ...c, k }))
      .filter((c) => !used.has(c.k))
      .sort((a, b) => b.torso.size - a.torso.size);
    for (const c of leftovers) {
      if (this.tracks.length >= MAX_TRACKS) break;
      const taken = new Set(this.tracks.map((t) => t.slot));
      const slot = [0, 1].find((s) => !taken.has(s)) ?? this.tracks.length;
      const track: Track = {
        slot,
        image: [],
        world: [],
        center: c.torso.center,
        size: c.torso.size,
        velocity: { x: 0, y: 0 },
        lastSeenSec: timeSec,
        estimatedJoints: [],
        legMemory: new Map(),
      };
      this.apply(track, c.d, c.torso, timeSec);
      this.tracks.push(track);
    }

    // 3) 결과: 찾은 선수는 그대로, 못 찾은 선수는 예측 위치로
    return [...this.tracks].sort((a, b) => a.slot - b.slot).map((t) => this.output(t, timeSec));
  }

  /** 마지막으로 본 뒤 움직이던 방향으로, 시간이 갈수록 느려지게 옮긴 거리 */
  private drift(track: Track, timeSec: number): Vec2 {
    const lost = Math.max(0, timeSec - track.lastSeenSec);
    const k = VELOCITY_TAU_SEC * (1 - Math.exp(-lost / VELOCITY_TAU_SEC));
    return { x: track.velocity.x * k, y: track.velocity.y * k };
  }

  private predictCenter(track: Track, timeSec: number): Vec2 {
    const d = this.drift(track, timeSec);
    return { x: track.center.x + d.x, y: track.center.y + d.y };
  }

  /** 선수마다 짝지을 사람 번호 (-1 = 이번 장면에서 못 찾음) */
  private bestAssignment(predicted: Vec2[], candidates: { center: Vec2; size: number }[], timeSec: number): number[] {
    let best: number[] = predicted.map(() => -1);
    let bestCost = Infinity;
    const current: number[] = [];
    const visit = (i: number, cost: number, used: Set<number>) => {
      if (cost >= bestCost) return;
      if (i === predicted.length) {
        bestCost = cost;
        best = [...current];
        return;
      }
      const track = this.tracks[i];
      const gate = GATE_TORSO + GATE_GROWTH_TORSO_PER_SEC * Math.max(0, timeSec - track.lastSeenSec);
      // 못 찾은 것으로 두는 경우 (비용 = 허용 거리)
      current.push(-1);
      visit(i + 1, cost + gate, used);
      current.pop();
      candidates.forEach(({ center: c, size }, k) => {
        if (used.has(k)) return;
        const dist = Math.hypot(c.x - predicted[i].x, c.y - predicted[i].y) / track.size;
        // 화면 속 몸 크기 차이: 카메라에서 먼 선수는 작게 보이므로, 엇갈려 지나갈 때 누가 누구인지 가려 준다
        const sizeGap = Math.abs(Math.log(size / track.size));
        const sizeGate = MAX_SIZE_GAP + SIZE_GATE_GROWTH_PER_SEC * Math.max(0, timeSec - track.lastSeenSec);
        if (dist > gate || sizeGap > sizeGate) return;
        used.add(k);
        current.push(k);
        visit(i + 1, cost + dist + SIZE_WEIGHT * sizeGap, used);
        current.pop();
        used.delete(k);
      });
    };
    visit(0, 0, new Set());
    return best;
  }

  private apply(track: Track, detection: PoseDetection, torso: { center: Vec2; size: number }, timeSec: number) {
    const repaired = repairLegs(detection, track.legMemory, this.aspect);
    const dt = timeSec - track.lastSeenSec;
    if (track.image.length > 0 && dt > 0) {
      const vx = (torso.center.x - track.center.x) / dt;
      const vy = (torso.center.y - track.center.y) / dt;
      let nx = 0.6 * track.velocity.x + 0.4 * vx;
      let ny = 0.6 * track.velocity.y + 0.4 * vy;
      const speed = Math.hypot(nx, ny);
      if (speed > MAX_SPEED) {
        nx *= MAX_SPEED / speed;
        ny *= MAX_SPEED / speed;
      }
      track.velocity = { x: nx, y: ny };
    }
    track.image = repaired.image;
    track.world = repaired.world;
    track.estimatedJoints = repaired.estimatedJoints;
    track.center = torso.center;
    track.size = torso.size;
    track.lastSeenSec = timeSec;
  }

  private output(track: Track, timeSec: number): TrackedPerson {
    const lostSec = Math.max(0, timeSec - track.lastSeenSec);
    if (lostSec === 0) {
      return { slot: track.slot, image: track.image, world: track.world, predicted: false, lostSec, estimatedJoints: track.estimatedJoints };
    }
    // 못 찾은 선수: 마지막 자세를 예측 위치로 옮겨 보여 준다 (3D 자세는 엉덩이 기준이라 그대로 둔다)
    const d = this.drift(track, timeSec);
    const dx = d.x / this.aspect;
    return {
      slot: track.slot,
      image: track.image.map((p) => ({ ...p, x: p.x + dx, y: p.y + d.y })),
      world: track.world,
      predicted: true,
      lostSec,
      estimatedJoints: track.estimatedJoints,
    };
  }
}
