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
 * @returns 3D 관절에 더할 거리. 믿을 만한 뼈대가 하나도 없으면 null
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
  if (ratios.length === 0) return null;
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

/** 깊이를 거르는 정도. 깊이 어림은 장면마다 흔들리므로 위치보다 더 많이 거른다 */
const PLACE_MIN_CUTOFF_HZ = 0.5;
/** 선수가 빠르게 들어가고 빠질 때(약 2 m/s)는 1.5 Hz까지 열려 따라간다 */
const PLACE_BETA = 0.5;

/** 선수마다 카메라 기준 위치를 구하고 흔들림을 걸러 붙인다 */
export class CameraPlacer {
  private filters = new Map<string, OneEuroFilter>();
  private last = new Map<number, CameraPoint>();
  private lastTimeSec: number | null = null;
  private focalHeights: number | null = null;

  reset() {
    this.filters.clear();
    this.last.clear();
    this.lastTimeSec = null;
  }

  apply(people: TrackedPerson[], timeSec: number, aspect: number, focalHeights: number): TrackedPerson[] {
    // 뒤로 감거나 카메라 설정을 바꾸면 새로 시작한다
    if ((this.lastTimeSec !== null && timeSec < this.lastTimeSec) || this.focalHeights !== focalHeights) this.reset();
    this.lastTimeSec = timeSec;
    this.focalHeights = focalHeights;

    return people.map((person) => {
      const raw = placeInCamera(person.image, person.world, aspect, focalHeights);
      let camera = this.last.get(person.slot);
      if (raw) {
        const f = (axis: keyof CameraPoint) => {
          const id = `${person.slot}:${axis}`;
          let filter = this.filters.get(id);
          if (!filter) {
            filter = new OneEuroFilter(PLACE_MIN_CUTOFF_HZ, PLACE_BETA);
            this.filters.set(id, filter);
          }
          return filter.filter(raw[axis], timeSec);
        };
        camera = { x: f("x"), y: f("y"), z: f("z") };
        this.last.set(person.slot, camera);
      }
      return { ...person, camera };
    });
  }
}
