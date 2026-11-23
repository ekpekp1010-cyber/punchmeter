// Design Ref: §5.1 분석 시뮬레이션 — 원근감(멀리 있는 선수는 작게 보임)을 반영해 두 선수를 3D 공간에 배치한다.
// 핀홀 카메라 모델: 화면 속 길이 = 초점거리 × 실제 길이 ÷ 카메라까지 거리.
// 관절 찾기 도구가 준 실제 크기 3D 관절(m)과 화면 속 관절 길이를 비교하면, 선수마다 카메라까지의 거리(깊이)를 구할 수 있다.
// 그림(배치)용이다. 속도 계산의 m 환산은 PLAN 작업 6·13에서 키·리치 입력으로 따로 한다.

import type { PoseLandmark } from "../types";
import { LANDMARK as L } from "./landmarks";
import { OneEuroFilter } from "./smoothing";
import type { TrackedPerson } from "./poseTracker";

/** 35mm 필름 대각선 길이 (mm). "35mm 환산 초점거리"의 기준 */
const FILM_DIAGONAL_MM = Math.hypot(36, 24);

/** 촬영 카메라 선택지 (35mm 환산 초점거리). 실제 값을 모르므로 사용자가 고른다 */
export const CAMERA_PRESETS = [
  { id: "phone", label: "휴대폰 기본 카메라", focal35mm: 26 },
  { id: "zoom2", label: "휴대폰 2배 줌", focal35mm: 52 },
  { id: "broadcast", label: "경기 중계·멀리서 크게 당겨 찍음", focal35mm: 100 },
] as const;
export type CameraPresetId = (typeof CAMERA_PRESETS)[number]["id"];

/**
 * 초점거리를 "화면 높이" 단위로 바꾼다.
 * 35mm 환산 초점거리는 대각선 기준이므로, 화면 대각선(가로 aspect, 세로 1)에 같은 비율을 적용한다.
 */
export function focalInScreenHeights(focal35mm: number, aspect: number): number {
  return (focal35mm * Math.hypot(aspect, 1)) / FILM_DIAGONAL_MM;
}

/** 세로 화각 (도). 3D 화면의 처음 시점을 원본 영상과 같게 맞출 때 쓴다 */
export function verticalFovDeg(focalHeights: number): number {
  return (2 * Math.atan(0.5 / focalHeights) * 180) / Math.PI;
}

/** 깊이를 어림할 때 쓰는 뼈대 (양 끝 관절) */
const SEGMENTS: [number, number][] = [
  [L.leftShoulder, L.rightShoulder],
  [L.leftHip, L.rightHip],
  [L.leftShoulder, L.leftHip],
  [L.rightShoulder, L.rightHip],
  [L.leftShoulder, L.leftElbow],
  [L.rightShoulder, L.rightElbow],
  [L.leftElbow, L.leftWrist],
  [L.rightElbow, L.rightWrist],
  [L.leftHip, L.leftKnee],
  [L.rightHip, L.rightKnee],
  [L.leftKnee, L.leftAnkle],
  [L.rightKnee, L.rightAnkle],
];
/** 이보다 잘 보이는 관절만 쓴다 (채워 넣은 관절은 0.15라 자동으로 빠진다) */
const MIN_VISIBILITY = 0.5;
/** 깊이를 어림하려면 믿을 만한 뼈대가 이만큼은 있어야 한다 (한두 개로는 쉽게 틀린다) */
const MIN_SEGMENTS = 3;
/** 카메라 쪽으로 누워 거의 점처럼 보이는 뼈대는 비율이 불안정해 뺀다 (m) */
const MIN_SEGMENT_XY_M = 0.08;

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 카메라 기준 3D 위치 (m). x 오른쪽, y 아래, z 카메라에서 멀어지는 쪽 (MediaPipe와 같은 방향) */
export interface CameraPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * 선수의 3D 관절(엉덩이 원점)을 카메라 공간으로 옮길 거리를 구한다.
 * 비율 = 화면 속 뼈 길이 ÷ 그 뼈를 카메라 정면에서 본 실제 길이(x·y만, 앞뒤로 기운 만큼은 빠짐) → 깊이 = 초점거리 ÷ 비율.
 * 뼈대마다 구한 비율의 가운데 값을 써서 한두 관절이 틀려도 크게 흔들리지 않게 한다.
 * @returns 3D 관절에 더할 거리. 믿을 만한 뼈대가 3개 미만이면 null
 */
export function placeInCamera(
  image: PoseLandmark[],
  world: PoseLandmark[],
  aspect: number,
  focalHeights: number,
): CameraPoint | null {
  const ratios: number[] = [];
  for (const [a, b] of SEGMENTS) {
    const ia = image[a];
    const ib = image[b];
    const wa = world[a];
    const wb = world[b];
    if (!ia || !ib || !wa || !wb) continue;
    if (ia.visibility < MIN_VISIBILITY || ib.visibility < MIN_VISIBILITY) continue;
    const worldXY = Math.hypot(wa.x - wb.x, wa.y - wb.y);
    if (worldXY < MIN_SEGMENT_XY_M) continue;
    const imageLen = Math.hypot((ia.x - ib.x) * aspect, ia.y - ib.y);
    ratios.push(imageLen / worldXY);
  }
  if (ratios.length < MIN_SEGMENTS) return null;
  const screenPerMeter = median(ratios);
  if (screenPerMeter <= 0) return null;
  const depth = focalHeights / screenPerMeter;

  // 엉덩이 가운데의 화면 위치를 카메라 공간으로 되돌린다
  const lh = image[L.leftHip];
  const rh = image[L.rightHip];
  const wl = world[L.leftHip];
  const wr = world[L.rightHip];
  const u = ((lh.x + rh.x) / 2 - 0.5) * aspect;
  const v = (lh.y + rh.y) / 2 - 0.5;
  const hip: CameraPoint = { x: (u * depth) / focalHeights, y: (v * depth) / focalHeights, z: depth };
  // 3D 관절의 엉덩이 가운데가 정확히 원점이 아닐 수 있어 빼 준다
  return { x: hip.x - (wl.x + wr.x) / 2, y: hip.y - (wl.y + wr.y) / 2, z: hip.z - (wl.z + wr.z) / 2 };
}

// ─────────────────────────────────────────────
// 물리적으로 가능한 움직임만 허용하는 위치 따라가기
// ─────────────────────────────────────────────
// 아래 세 값은 측정값이 아니라 "그림이 튀지 않게" 정한 그림용 설정값이다 (실제 영상 시험 후 조정).
// 링·케이지 안에서 선수가 스텝으로 뛰어드는 움직임은 넉넉히 따라가고, 한 장면 사이에 몇 m씩 순간이동하는 것은 막는다.

/** 몸 전체(엉덩이 위치)의 최고 이동 속도 (m/s) */
export const MAX_BODY_SPEED_MPS = 5;
/** 몸 전체의 최고 가속도 (m/s²). 멈춰 있다가 0.5초 만에 최고 속도에 닿는 정도 */
export const MAX_BODY_ACCEL_MPS2 = 10;
/** 목표 위치를 따라가는 반응 시간 (초) */
const FOLLOW_TAU_SEC = 0.15;
/** 처음 위치를 정할 때 모으는 시간 (초). 이 동안 어림값의 가운데 값을 시작 위치로 삼는다 */
export const START_WINDOW_SEC = 0.5;
/** 최근 몇 장면의 가운데 값을 목표로 삼을지 (한두 장면 튀는 값은 무시된다) */
const TARGET_WINDOW = 5;
/** 장면 사이가 이보다 길면 이만큼만 움직인 것으로 본다 (초) */
const MAX_STEP_SEC = 0.2;

interface BodyMotion {
  /** 처음 위치를 정하는 중에 모은 어림값 */
  startSamples: CameraPoint[];
  startedAt: number;
  started: boolean;
  position: CameraPoint;
  velocity: CameraPoint;
  /** 최근 어림값 (목표 위치 계산용) */
  recent: CameraPoint[];
  lastTimeSec: number;
}

const medianPoint = (points: CameraPoint[]): CameraPoint => ({
  x: median(points.map((p) => p.x)),
  y: median(points.map((p) => p.y)),
  z: median(points.map((p) => p.z)),
});

const clampLength = (v: CameraPoint, max: number): CameraPoint => {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > max ? { x: (v.x * max) / l, y: (v.y * max) / l, z: (v.z * max) / l } : v;
};

/**
 * 선수마다 카메라 기준 위치를 정한다.
 * 1) 처음 등장한 뒤 0.5초 동안의 어림값 가운데 값으로 시작 위치를 정한다.
 * 2) 그 뒤로는 최근 5장면 어림값의 가운데 값을 목표로, 최고 속도·가속도를 넘지 않게 따라간다.
 *    그래서 어림값이 갑자기 몇 m씩 튀어도 모델은 순간이동하지 않고, 실제로 계속 그 자리면 사람이 움직일 수 있는 속도로 옮겨 간다.
 */
export class CameraPlacer {
  private bodies = new Map<number, BodyMotion>();
  private lastTimeSec: number | null = null;
  private focalHeights: number | null = null;

  reset() {
    this.bodies.clear();
    this.lastTimeSec = null;
  }

  apply(people: TrackedPerson[], timeSec: number, aspect: number, focalHeights: number): TrackedPerson[] {
    // 뒤로 감거나 카메라 설정을 바꾸면 새로 시작한다
    if ((this.lastTimeSec !== null && timeSec < this.lastTimeSec) || this.focalHeights !== focalHeights) this.reset();
    this.lastTimeSec = timeSec;
    this.focalHeights = focalHeights;

    return people.map((person) => {
      const raw = placeInCamera(person.image, person.world, aspect, focalHeights);
      const camera = this.step(person.slot, raw, timeSec);
      return camera ? { ...person, camera } : { ...person };
    });
  }

  private step(slot: number, raw: CameraPoint | null, timeSec: number): CameraPoint | null {
    let body = this.bodies.get(slot);
    if (!body) {
      if (!raw) return null;
      body = {
        startSamples: [raw],
        startedAt: timeSec,
        started: false,
        position: raw,
        velocity: { x: 0, y: 0, z: 0 },
        recent: [raw],
        lastTimeSec: timeSec,
      };
      this.bodies.set(slot, body);
      return body.position;
    }

    // 1) 시작 위치 정하기: 모은 어림값의 가운데 값에 세워 둔다
    if (!body.started) {
      if (raw) body.startSamples.push(raw);
      body.position = medianPoint(body.startSamples);
      body.lastTimeSec = timeSec;
      if (timeSec - body.startedAt >= START_WINDOW_SEC) {
        body.started = true;
        body.recent = body.startSamples.slice(-TARGET_WINDOW);
      }
      return body.position;
    }

    // 2) 물리적으로 가능한 만큼만 목표 쪽으로 움직인다
    if (raw) {
      body.recent.push(raw);
      if (body.recent.length > TARGET_WINDOW) body.recent.shift();
    }
    const dt = Math.min(MAX_STEP_SEC, Math.max(0, timeSec - body.lastTimeSec));
    body.lastTimeSec = timeSec;
    if (dt === 0) return body.position;
    const target = medianPoint(body.recent);
    const wanted = clampLength(
      {
        x: (target.x - body.position.x) / FOLLOW_TAU_SEC,
        y: (target.y - body.position.y) / FOLLOW_TAU_SEC,
        z: (target.z - body.position.z) / FOLLOW_TAU_SEC,
      },
      MAX_BODY_SPEED_MPS,
    );
    const dv = clampLength(
      { x: wanted.x - body.velocity.x, y: wanted.y - body.velocity.y, z: wanted.z - body.velocity.z },
      MAX_BODY_ACCEL_MPS2 * dt,
    );
    body.velocity = { x: body.velocity.x + dv.x, y: body.velocity.y + dv.y, z: body.velocity.z + dv.z };
    body.position = {
      x: body.position.x + body.velocity.x * dt,
      y: body.position.y + body.velocity.y * dt,
      z: body.position.z + body.velocity.z * dt,
    };
    return body.position;
  }
}

// ─────────────────────────────────────────────
// 영상 구도 따라가기 (기본 방식)
// ─────────────────────────────────────────────
// 선수 위치를 "고정된 3D 공간"에 재구성하지 않고, 영상에 보이는 구도를 그대로 따른다.
// 관절마다 화면 속 위치를 지나는 시선(카메라에서 뻗은 직선) 위에 놓고, 앞뒤 거리만 어림한다.
// 그래서 영상 시점에서 보면 모델이 영상 속 선수와 정확히 같은 자리·같은 자세로 보이고,
// 중계 카메라가 돌거나 당겨져도 모델이 엉뚱하게 날아가지 않는다 (카메라가 움직이면 모델도 영상처럼 움직인다).

/**
 * 관절을 카메라 공간(m)에 놓는다: 화면 속 위치는 그대로, 깊이 = 선수 깊이 + 관절별 앞뒤 차이(3D 관절의 z).
 * @param depth 선수 엉덩이 가운데까지의 거리 (m)
 */
export function composeInCamera(
  image: PoseLandmark[],
  world: PoseLandmark[],
  aspect: number,
  focalHeights: number,
  depth: number,
): PoseLandmark[] {
  const hipZ = (world[L.leftHip].z + world[L.rightHip].z) / 2;
  return image.map((p, i) => {
    const z = Math.max(0.3, depth + ((world[i]?.z ?? hipZ) - hipZ));
    return {
      x: (((p.x - 0.5) * aspect) * z) / focalHeights,
      y: ((p.y - 0.5) * z) / focalHeights,
      z,
      visibility: p.visibility,
    };
  });
}

/** 선수 깊이(앞뒤 거리) 거르기: 영상 시점 모습에는 영향이 없고 옆에서 볼 때만 쓰이므로 크게 걸러 흔들림을 없앤다 */
const DEPTH_MIN_CUTOFF_HZ = 0.3;
const DEPTH_BETA = 0.3;

/** 영상 구도를 따라 선수마다 카메라 공간 관절(cameraJoints)을 붙인다 */
export class CompositionPlacer {
  private filters = new Map<number, OneEuroFilter>();
  private lastDepth = new Map<number, number>();
  private lastTimeSec: number | null = null;
  private focalHeights: number | null = null;

  reset() {
    this.filters.clear();
    this.lastDepth.clear();
    this.lastTimeSec = null;
  }

  apply(people: TrackedPerson[], timeSec: number, aspect: number, focalHeights: number): TrackedPerson[] {
    if ((this.lastTimeSec !== null && timeSec < this.lastTimeSec) || this.focalHeights !== focalHeights) this.reset();
    this.lastTimeSec = timeSec;
    this.focalHeights = focalHeights;

    return people.map((person) => {
      const raw = placeInCamera(person.image, person.world, aspect, focalHeights);
      let depth = this.lastDepth.get(person.slot);
      if (raw) {
        let filter = this.filters.get(person.slot);
        if (!filter) {
          filter = new OneEuroFilter(DEPTH_MIN_CUTOFF_HZ, DEPTH_BETA);
          this.filters.set(person.slot, filter);
        }
        const hipZ = (person.world[L.leftHip].z + person.world[L.rightHip].z) / 2;
        depth = filter.filter(raw.z + hipZ, timeSec);
        this.lastDepth.set(person.slot, depth);
      }
      if (depth === undefined) return { ...person };
      return { ...person, cameraJoints: composeInCamera(person.image, person.world, aspect, focalHeights, depth) };
    });
  }
}
