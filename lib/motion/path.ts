// Design Ref: §4.5 동작을 만드는 방법 — 끝점(주먹·발) 경로와 속도 곡선 (PLAN 작업 11)
// 경로를 "길이 기준"으로 바꿔 두면, 시간마다 지나간 길이 s(t)를 정하는 것만으로 끝점 속도를 정확히 맞출 수 있다.
//
// 속도 곡선: 멈춘 자세에서 출발해 일정하게 빨라진다 (등가속도).
//   s(t) = L × (t / T)²  →  닿는 순간(t = T) 속도 = 2L / T
//   그래서 닿는 순간 속도를 v로 맞추려면 뻗는 시간 T = 2L / v.

import { Vector3 } from "three";

/** 길이 기준 경로 */
export interface ArcPath {
  /** 경로 전체 길이(m) */
  length: number;
  /** 출발점에서 경로를 따라 s(m) 간 곳 */
  at(s: number, target?: Vector3): Vector3;
}

/** 곡선 c(u), u = 0~1을 잘게 나눠 길이 기준 경로로 바꾼다 */
export function arcPath(curve: (u: number, target: Vector3) => Vector3, samples = 400): ArcPath {
  const points: Vector3[] = [];
  const cumulative: number[] = [0];
  for (let i = 0; i <= samples; i++) {
    points.push(curve(i / samples, new Vector3()));
    if (i > 0) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
  }
  const length = cumulative[samples];
  return {
    length,
    at(s: number, target = new Vector3()) {
      if (s <= 0) return target.copy(points[0]);
      if (s >= length) return target.copy(points[samples]);
      // 이진 탐색으로 s가 들어 있는 조각을 찾는다
      let lo = 0;
      let hi = samples;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid] <= s) lo = mid;
        else hi = mid;
      }
      const k = (s - cumulative[lo]) / (cumulative[hi] - cumulative[lo]);
      return target.copy(points[lo]).lerp(points[hi], k);
    },
  };
}

/** 직선 a → b */
export function linePath(a: Vector3, b: Vector3): ArcPath {
  return arcPath((u, t) => t.copy(a).lerp(b, u), 2);
}

/** 3차 베지어 곡선 p0 → p3 (p1·p2는 휘는 방향을 정하는 점) */
export function bezierPath(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3): ArcPath {
  return arcPath((u, t) => {
    const v = 1 - u;
    return t
      .copy(p0)
      .multiplyScalar(v * v * v)
      .addScaledVector(p1, 3 * v * v * u)
      .addScaledVector(p2, 3 * v * u * u)
      .addScaledVector(p3, u * u * u);
  });
}

/** 닿는 순간 속도가 v(m/s)가 되는 뻗는 시간(초) */
export function extendDuration(pathLength: number, contactSpeedMps: number): number {
  if (contactSpeedMps <= 0) throw new Error("속도는 0보다 커야 합니다");
  return (2 * pathLength) / contactSpeedMps;
}

/** 뻗는 동안 지나간 길이 (0 ≤ t ≤ T, 등가속도) */
export function extendDistance(pathLength: number, duration: number, t: number): number {
  const u = Math.min(1, Math.max(0, t / duration));
  return pathLength * u * u;
}

/** 부드럽게 출발·도착하는 비율 (되돌아오기·몸통 회전용) */
export function smoothStep(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}
