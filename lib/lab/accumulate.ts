// Design Ref: §2.2 처리 ⑤ — 부위별 누적: 22곳마다 쌓인 충격력(리게인 기준) ÷ 한계 힘 × 100 → 색 단계 0~5
// PLAN 작업 7. 3D 장면은 이 결과를 받아 색만 칠한다 (DESIGN §10: 3D 코드는 숫자를 새로 만들지 않는다).

import { colorStep, loadRatioPct, partThreshold } from "../physics";
import { BODY_PARTS } from "../reference";
import type { BodyPart, Estimate, Fighter, FighterId, PartLoad } from "../types";

/** 누적에 넣을 타격 하나 */
export interface HitForLoad {
  /** 맞은 선수 */
  defender: FighterId;
  /** 실제로 맞은 부위 (막혔으면 막은 부위) */
  hitPart: BodyPart;
  /** 리게인 기준 추정 충격력(N) */
  forceN: number;
}

/** 한 선수의 부위 한계 힘(N)을 근거와 함께 */
function thresholdEstimate(part: BodyPart, defender: Fighter): Estimate {
  const t = partThreshold(part, defender.sex, defender.heightCm);
  return { value: t.forceN, basis: t.estimated ? "estimated" : "research", sourceIds: t.sourceIds };
}

/**
 * 맞은 선수의 22곳 누적 충격.
 * hits 중 이 선수(defender.id)가 맞은 타격만 더한다. 맞지 않은 부위도 0으로 22곳 모두 돌려준다.
 * 한계 힘 자료가 없는 부위가 생기면 ratioPct·colorStep = null ("자료 없음" 빗금).
 */
export function accumulateLoads(hits: HitForLoad[], defender: Fighter): PartLoad[] {
  const sums = new Map<BodyPart, number>();
  for (const h of hits) {
    if (h.defender !== defender.id) continue;
    if (!Number.isFinite(h.forceN) || h.forceN < 0) throw new Error("충격력은 0 이상의 숫자여야 합니다");
    sums.set(h.hitPart, (sums.get(h.hitPart) ?? 0) + h.forceN);
  }
  return BODY_PARTS.map(({ id }) => {
    const accumulatedForceN = sums.get(id) ?? 0;
    const thresholdN = thresholdEstimate(id, defender);
    const ratioPct = thresholdN.value === null ? null : loadRatioPct(accumulatedForceN, thresholdN.value);
    return {
      defender: defender.id,
      part: id,
      accumulatedForceN,
      thresholdN,
      ratioPct,
      colorStep: colorStep(ratioPct),
    };
  });
}
