// Design Ref: §4.5 — 두 뼈 IK: 끝점 위치를 주면 가운데 관절(팔꿈치·무릎) 위치를 계산한다 (PLAN 작업 11)
// 어깨(엉덩이) S, 끝점 목표 T, 위 뼈 길이 L1, 아래 뼈 길이 L2, 가운데 관절이 향할 쪽(pole)을 받는다.
// 목표가 팔 길이보다 멀면 팔을 거의 다 편 채 목표 쪽으로 뻗고, reached = false로 알린다.

import { Vector3 } from "three";

export interface TwoBoneResult {
  /** 가운데 관절 위치 */
  joint: Vector3;
  /** 실제로 끝점이 가는 위치 (닿으면 목표와 같다) */
  end: Vector3;
  /** 목표에 닿았는가 */
  reached: boolean;
  /** 가운데 관절 각도(°). 180 = 다 편 상태 */
  jointAngleDeg: number;
}

/** 다 펴지는 것을 막는 여유 (완전히 펴면 IK가 흔들린다) */
const STRAIGHT_MARGIN = 0.999;

export function solveTwoBone(S: Vector3, T: Vector3, L1: number, L2: number, pole: Vector3): TwoBoneResult {
  const toTarget = new Vector3().subVectors(T, S);
  const rawDist = toTarget.length();
  const maxDist = (L1 + L2) * STRAIGHT_MARGIN;
  const minDist = Math.abs(L1 - L2) + 1e-6;
  const d = Math.min(maxDist, Math.max(minDist, rawDist));
  const dir = rawDist > 1e-9 ? toTarget.clone().divideScalar(rawDist) : new Vector3(0, 0, 1);

  // 코사인 법칙: S에서 관절까지를 목표 방향으로 a, 수직으로 h만큼
  const a = (L1 * L1 + d * d - L2 * L2) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));

  // pole 방향에서 목표 방향 성분을 빼서 수직 방향을 만든다
  const bend = new Vector3().subVectors(pole, S);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-12) bend.set(0, -1, 0).addScaledVector(dir, -dir.y);
  bend.normalize();

  const joint = S.clone().addScaledVector(dir, a).addScaledVector(bend, h);
  const end = S.clone().addScaledVector(dir, d);
  const u = new Vector3().subVectors(S, joint).normalize();
  const w = new Vector3().subVectors(end, joint).normalize();
  const jointAngleDeg = (Math.acos(Math.min(1, Math.max(-1, u.dot(w)))) * 180) / Math.PI;

  return { joint, end, reached: rawDist <= maxDist && rawDist >= minDist, jointAngleDeg };
}
