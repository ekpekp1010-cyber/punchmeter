// Design Ref: §2.2 처리 ② — 몸무게(계체량·리게인)와 분절(몸 조각) 무게·길이
// 분절 값은 de Leva 1996 (lib/reference/segments.ts)을 쓴다.

import { REFERENCE_STATURE_MM, SEGMENT_PARAMS, type Segment, type SegmentParam } from "../reference";
import type { Sex } from "../types";

/** 키 입력 범위(cm) */
export const HEIGHT_MIN_CM = 140;
export const HEIGHT_MAX_CM = 220;

/** 키가 받을 수 있는 범위(140~220cm)인지 */
export function isValidHeight(heightCm: number): boolean {
  return Number.isFinite(heightCm) && heightCm >= HEIGHT_MIN_CM && heightCm <= HEIGHT_MAX_CM;
}

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

