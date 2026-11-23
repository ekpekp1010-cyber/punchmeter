// Design Ref: §2.2 처리 ⑧·⑨ — 운동량·운동에너지·추정 충격력·글러브 보정·강도 지수

import { GLOVE_PEAK_FORCE, MAX_FORCE_RECORD, STRIKE_BENCHMARKS, EFFECTIVE_MASS } from "../reference";
import type { GloveOz } from "../types";

export type Limb = "punch" | "kick";

/** 운동량(kg·m/s) = 유효 질량 × 속도 */
export function momentum(effectiveMassKg: number, speedMs: number): number {
  return effectiveMassKg * speedMs;
}

/** 운동에너지(J) = ½ × 유효 질량 × 속도² */
export function kineticEnergy(effectiveMassKg: number, speedMs: number): number {
  return 0.5 * effectiveMassKg * speedMs ** 2;
}

/**
 * 충격 시간(초) — 운동량을 최대 충격력으로 바꾸는 데 쓰는 환산값 (환산 추정값).
 * 영상으로는 맞는 순간의 접촉 시간을 잴 수 없어서, 올림픽 복서 연구(walilko2005)의 평균으로 정한다:
 *   유효 질량 2.9kg × 속도 9.14 m/s ÷ 최대 충격력 3427 N ≈ 0.0077초
 * 이 연구는 글러브를 낀 스트레이트 펀치라, 킥에도 같은 값을 쓰는 것은 추정이다.
 */
function walilkoValue(measure: "velocity" | "peakForce"): number {
  const entry = STRIKE_BENCHMARKS.find(
    (b) => b.strike === "straightPunch" && b.measure === measure && b.sourceIds.includes("walilko2005"),
  );
  if (!entry || typeof entry.value !== "number") throw new Error("walilko2005 기준값이 없습니다");
  return entry.value;
}
const WALILKO_MASS = EFFECTIVE_MASS.find((e) => e.sourceIds.includes("walilko2005"))?.value;
if (typeof WALILKO_MASS !== "number") throw new Error("walilko2005 유효 질량이 없습니다");

export const CONTACT_TIME_S = (WALILKO_MASS * walilkoValue("velocity")) / walilkoValue("peakForce");

/** 추정 최대 충격력(N) = 운동량 ÷ 충격 시간 (글러브 보정 전) */
export function peakForceN(effectiveMassKg: number, speedMs: number): number {
  return momentum(effectiveMassKg, speedMs) / CONTACT_TIME_S;
}

export interface GloveFactor {
  /** 충격력에 곱하는 값 (10oz = 1 기준) */
  factor: number;
  /**
   * measured: 같은 실험에서 잰 값 (10·12·14·16oz)
   * borrowed: 자료가 없어 10oz 값을 빌림 (8oz, "추정")
   * insufficient: 근거 부족, 흡수 없음으로 계산 (맨손·4oz)
   * notApplicable: 킥이라 보정하지 않음
   */
  basis: "measured" | "borrowed" | "insufficient" | "notApplicable";
}

/**
 * 글러브 무게별 충격력 보정 (사용자가 고른 추천안).
 * 충격 시간 환산값이 글러브를 낀 펀치(walilko2005)로 정해졌으므로 10oz를 기준(1)으로 둔다.
 * 10~16oz는 nakano2009의 측정값 비율. 단, 이 연구에서 무게 사이 차이는 통계적으로 의미가 없었다.
 */
export function gloveForceFactor(gloveOz: GloveOz, limb: Limb): GloveFactor {
  if (limb === "kick") return { factor: 1, basis: "notApplicable" };
  if (gloveOz === 0 || gloveOz === 4) return { factor: 1, basis: "insufficient" };
  if (gloveOz === 8) return { factor: 1, basis: "borrowed" };
  const base = GLOVE_PEAK_FORCE.find((g) => g.gloveOz === 10)?.value;
  const target = GLOVE_PEAK_FORCE.find((g) => g.gloveOz === gloveOz)?.value;
  if (typeof base !== "number" || typeof target !== "number") {
    throw new Error(`글러브 측정값이 없습니다: ${gloveOz}oz`);
  }
  return { factor: target / base, basis: "measured" };
}

/** 타격 강도 지수(0~100) = 충격력 ÷ 공개 최고 충격력 기록 × 100, 100을 넘으면 100 */
export function intensityIndex(forceN: number, limb: Limb): number {
  const record = MAX_FORCE_RECORD[limb].value;
  if (typeof record !== "number") throw new Error("최고 기록 값이 없습니다");
  return Math.min(100, (forceN / record) * 100);
}
