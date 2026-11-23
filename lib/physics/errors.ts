// Design Ref: §5.4 결과 확인 목록 — 모든 숫자 옆에 그 숫자에 맞는 오차 범위를 붙인다
// Plan SC: 속도 오차 정밀 ±7% / 일반 ±15%, 각도 오차 정밀 ±5° / 일반 ±10°, 관절기 ±10°

import type { AnalysisMode, Measured } from "../types";

/** 속도 오차(%). 운동량·충격력·강도 지수도 같은 값을 쓴다 (PRD 5번) */
export const SPEED_ERROR_PCT: Record<AnalysisMode, number> = { precise: 7, general: 15 };

/** 진행 방향 각도 오차(°) */
export const ANGLE_ERROR_DEG: Record<AnalysisMode, number> = { precise: 5, general: 10 };

/** 관절기 회전 각도 오차(°) */
export const JOINT_LOCK_ERROR_DEG = 10;

/**
 * 속도의 제곱으로 계산하는 값(운동에너지)의 오차(%).
 * 속도가 e% 틀리면 제곱 값은 (1 + e)² − 1 만큼 틀린다. 예: 7% → 14.5%, 15% → 32.3%
 */
export function squaredErrorPct(speedErrorPct: number): number {
  const e = speedErrorPct / 100;
  // 소수 계산 오차(32.25가 32.2499…로 저장되는 문제) 때문에 반올림이 내려가지 않도록 아주 작은 값을 더한다
  return Math.round(((1 + e) ** 2 - 1) * 1000 + 1e-9) / 10;
}

export type Quantity = "speed" | "momentum" | "force" | "intensity" | "energy";

/** 값 종류와 모드에 맞는 오차(%) */
export function errorPctFor(quantity: Quantity, mode: AnalysisMode): number {
  const base = SPEED_ERROR_PCT[mode];
  return quantity === "energy" ? squaredErrorPct(base) : base;
}

/** 숫자에 오차(%)를 붙인다. 값이 없으면 "측정 불가"(null) 그대로 둔다 */
export function withErrorPct(value: number | null, quantity: Quantity, mode: AnalysisMode): Measured {
  return { value, errorPct: errorPctFor(quantity, mode) };
}

/** 각도에 오차(°)를 붙인다 */
export function withErrorDeg(value: number | null, mode: AnalysisMode): Measured {
  return { value, errorDeg: ANGLE_ERROR_DEG[mode] };
}
