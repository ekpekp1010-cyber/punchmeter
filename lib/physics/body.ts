// Design Ref: §2.2 처리 ⑧ — 몸무게·분절(몸 조각) 계산과 화면 거리 환산
// 분절 값은 de Leva 1996 (lib/reference/segments.ts)을 쓴다.

import { REFERENCE_STATURE_MM, SEGMENT_PARAMS, type Segment, type SegmentParam } from "../reference";
import type { Sex } from "../types";
import { add, scale, sub, type Vec2 } from "./vector";

/** 리게인 몸무게 = 계체량 × 1.075 (일반적인 리게인 폭 +5~10%의 가운데 값) */
export const REGAIN_RATIO = 1.075;

export const WEIGH_IN_MIN_KG = 40;
export const WEIGH_IN_MAX_KG = 150;

/** 계체량이 받을 수 있는 범위(40~150kg)인지 */
export function isValidWeighIn(weighInKg: number): boolean {
  return Number.isFinite(weighInKg) && weighInKg >= WEIGH_IN_MIN_KG && weighInKg <= WEIGH_IN_MAX_KG;
}

/** 리게인 추정 몸무게(kg) */
export function regainKg(weighInKg: number): number {
  return weighInKg * REGAIN_RATIO;
}

export function segmentParam(segment: Segment): SegmentParam {
  const found = SEGMENT_PARAMS.find((p) => p.segment === segment);
  if (!found) throw new Error(`분절 자료가 없습니다: ${segment}`);
  return found;
}

/** 분절 무게(kg) = 체중 × 분절 비율 */
export function segmentMassKg(segment: Segment, bodyMassKg: number, sex: Sex): number {
  return (bodyMassKg * segmentParam(segment).massPct[sex]) / 100;
}

/** 분절 길이(m). 평균 분절 길이를 평균 키 대비 비율로 바꿔 입력한 키에 맞춘다 */
export function segmentLengthM(segment: Segment, heightCm: number, sex: Sex): number {
  const ratio = segmentParam(segment).lengthMm[sex] / REFERENCE_STATURE_MM[sex];
  return (heightCm / 100) * ratio;
}

/** 분절 무게중심 위치 = 시작점 + (끝점 − 시작점) × 무게중심 비율 */
export function segmentComPoint(origin: Vec2, end: Vec2, segment: Segment, sex: Sex): Vec2 {
  const t = segmentParam(segment).comPct[sex] / 100;
  return add(origin, scale(sub(end, origin), t));
}

/**
 * 화면 거리 1단위가 실제 몇 m인지 (키 기준).
 * standingHeightUnits는 서 있는 장면에서 잰 정수리~발바닥 화면 길이.
 */
export function metersPerUnitFromHeight(heightCm: number, standingHeightUnits: number): number {
  return heightCm / 100 / standingHeightUnits;
}

/** 화면 거리 1단위가 실제 몇 m인지 (리치 기준). armSpanUnits는 양팔을 벌린 화면 길이 */
export function metersPerUnitFromReach(reachCm: number, armSpanUnits: number): number {
  return reachCm / 100 / armSpanUnits;
}

/** 키 기준과 리치 기준을 합친 환산값. 리치가 없으면 키 기준만 쓴다 */
export function combinedMetersPerUnit(fromHeight: number, fromReach?: number): number {
  return fromReach === undefined ? fromHeight : (fromHeight + fromReach) / 2;
}
