// Design Ref: §2.2 처리 ⑩·⑪ — 부위별 한계 힘(N) 환산과 누적 충격 색 단계
// 힘(N)이 아닌 연구 기준은 힘으로 바꾸며, 바꾼 값은 "환산 추정값"이다.

import { G_TO_MS2, HEAD_EFFECTIVE_MASS_KG, PART_THRESHOLD_PLAN } from "../reference";
import type { BodyPart, Sex } from "../types";
import { segmentLengthM } from "./body";

/**
 * 굽힘 모멘트(N·m)를 힘(N)으로 바꾼다 (3점 굽힘, 양 끝 받침 가정).
 * 맞은 지점이 시작 관절에서 hitFromProximalM 떨어져 있으면 힘 = M × L ÷ (a × (L − a)),
 * 지점을 모르면 뼈 가운데(a = L/2)로 보고 힘 = 4 × M ÷ L.
 */
export function momentToForceN(momentNm: number, boneLengthM: number, hitFromProximalM?: number): number {
  const a = hitFromProximalM ?? boneLengthM / 2;
  if (a <= 0 || a >= boneLengthM) throw new Error("맞은 지점은 뼈의 양 끝 사이여야 합니다");
  return (momentNm * boneLengthM) / (a * (boneLengthM - a));
}

/** 머리 가속도(m/s²)를 힘(N)으로 바꾼다: 힘 = 머리 유효 질량 × 가속도 */
export function headAccelToForceN(accelMs2: number): number {
  return HEAD_EFFECTIVE_MASS_KG * accelMs2;
}

/** g 단위를 m/s²로 */
export function gToMs2(g: number): number {
  return g * G_TO_MS2;
}

export interface PartThreshold {
  part: BodyPart;
  /** 한계 힘(N) */
  forceN: number;
  /** 힘 단위가 아닌 기준을 환산했거나 다른 값을 빌렸으면 true ("환산 추정값"·"추정" 표시) */
  estimated: boolean;
  method: "force" | "moment" | "headAccel" | "borrowed";
  sourceIds: string[];
}

/** 부위의 한계 힘(N). 성별과 키로 뼈 길이를 정한다 */
export function partThreshold(
  part: BodyPart,
  sex: Sex,
  heightCm: number,
  hitFromProximalM?: number,
): PartThreshold {
  const plan = PART_THRESHOLD_PLAN[part];
  const value = plan.value[sex];
  let forceN: number;
  switch (plan.method) {
    case "force":
    case "borrowed":
      forceN = value;
      break;
    case "moment": {
      if (!plan.boneSegment) throw new Error(`뼈 분절이 정해지지 않았습니다: ${part}`);
      const boneLengthM = segmentLengthM(plan.boneSegment, heightCm, sex);
      forceN = momentToForceN(value, boneLengthM, hitFromProximalM);
      break;
    }
    case "headAccel":
      forceN = headAccelToForceN(value);
      break;
  }
  return {
    part,
    forceN,
    estimated: plan.method !== "force",
    method: plan.method,
    sourceIds: plan.sourceIds,
  };
}

/** 한계 힘 대비 누적 비율(%) */
export function loadRatioPct(accumulatedForceN: number, thresholdN: number): number {
  return (accumulatedForceN / thresholdN) * 100;
}

/**
 * 누적 충격 색 단계.
 * 0 = 기본색(0%), 1 = 1~24%, 2 = 25~49%, 3 = 50~74%, 4 = 75~99%, 5 = 100% 이상(부상 위험 구간).
 * 한계 힘 자료가 없으면(null) null → "자료 없음" 빗금.
 */
export function colorStep(ratioPct: number | null): 0 | 1 | 2 | 3 | 4 | 5 | null {
  if (ratioPct === null) return null;
  if (ratioPct <= 0) return 0;
  if (ratioPct < 25) return 1;
  if (ratioPct < 50) return 2;
  if (ratioPct < 75) return 3;
  if (ratioPct < 100) return 4;
  return 5;
}
