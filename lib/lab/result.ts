// Design Ref: §2.2 처리 ①~④ — 연타 목록의 한 칸을 계산 결과 하나(StrikeResult)로 묶는다
// PLAN 작업 7. 닿는 시각(contactTimeSec)은 재생 계획(PLAN 작업 11~15)에서 정해 넘겨준다.

import type { Fighter, StrikeResult, StrikeStep } from "../types";
import { medicalJudgment, resolveHitPart } from "./medical";
import { computeStrike } from "./strike";

/** 타격 한 번의 계산 결과. 의학적 판단은 리게인 기준 충격력으로 한다 */
export function buildStrikeResult(
  step: StrikeStep,
  attacker: Fighter,
  defender: Fighter,
  contactTimeSec: number,
): StrikeResult {
  const numbers = computeStrike(step, attacker);
  const { hitPart, outcome } = resolveHitPart(step);
  const forceRegain = numbers.force.regain.value as number;
  return {
    step,
    hitPart,
    outcome,
    speed: numbers.speed,
    momentum: numbers.momentum,
    energy: numbers.energy,
    force: numbers.force,
    intensityIndex: numbers.intensityIndex,
    medical: medicalJudgment(hitPart, forceRegain, defender, step.technique),
    contactTimeSec,
  };
}
