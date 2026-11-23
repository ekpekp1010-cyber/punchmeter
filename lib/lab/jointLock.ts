// Design Ref: §2.2 처리 "관절기 + 꺾는 각도" — 정상 움직임 범위 대비 몇 ° 넘었는지, 부상 기준이 있으면 판단
// PLAN 작업 7. 부상 기준 자료가 없는 관절기는 부상 판단을 하지 않는다 (PRD, DESIGN §8.2-9).

import { JOINT_LOCK_REFERENCE, type JointRangeEntry } from "../reference";
import type { Estimate, Fighter, FighterId, JointLockId, JointLockTrial } from "../types";

export interface JointLockJudgment {
  trial: JointLockTrial;
  /** 정상 범위 끝을 넘은 각도(°). 넘지 않았으면 0 이하 */
  overNormalDeg: number;
  /** 부상 기준을 넘었는가. 부상 기준 자료가 없으면 null (판단하지 않음) */
  overInjury: boolean | null;
  /** 화면에 보일 판단 문장 */
  text: string;
  sourceIds: string[];
}

/** 범위 값이면 위 끝(가장 많이 움직인 값)을 정상 범위 끝으로 본다 */
function endOf(entry: JointRangeEntry): number {
  return Array.isArray(entry.value) ? entry.value[1] : entry.value;
}

function toEstimate(entry: JointRangeEntry | null): Estimate {
  if (!entry) return { value: null, basis: "noData", sourceIds: [] };
  const value = endOf(entry);
  return Array.isArray(entry.value)
    ? { value, low: entry.value[0], high: entry.value[1], basis: "research", sourceIds: entry.sourceIds }
    : { value, basis: "research", sourceIds: entry.sourceIds };
}

const deg = (x: number) => `${Math.round(x * 10) / 10}°`;

/**
 * 관절기 실험 하나를 판단한다.
 * angleDeg는 사용자가 정한 꺾는 각도, defender는 당하는 선수 (성별로 정상 범위를 고른다).
 */
export function judgeJointLock(
  attacker: FighterId,
  lock: JointLockId,
  angleDeg: number,
  defender: Fighter,
): JointLockJudgment {
  if (!Number.isFinite(angleDeg) || angleDeg < 0) throw new Error("꺾는 각도는 0° 이상으로 넣어 주세요");
  const ref = JOINT_LOCK_REFERENCE[lock];
  const normal = ref.normalRange ? ref.normalRange[defender.sex] : null;
  const normalRangeDeg = toEstimate(normal);
  const injuryDeg = toEstimate(ref.injuryAngle);

  const trial: JointLockTrial = { attacker, lock, joint: ref.joint, angleDeg, normalRangeDeg, injuryDeg };
  const overNormalDeg = normalRangeDeg.value === null ? 0 : angleDeg - normalRangeDeg.value;
  const overInjury = injuryDeg.value === null ? null : angleDeg >= injuryDeg.value;

  const parts: string[] = [];
  if (normalRangeDeg.value === null) {
    parts.push("정상 움직임 범위 자료 없음");
  } else if (overNormalDeg > 0) {
    parts.push(`정상 범위 끝(${deg(normalRangeDeg.value)})보다 ${deg(overNormalDeg)} 더 꺾임`);
  } else {
    parts.push(`정상 범위(${deg(normalRangeDeg.value)}) 안`);
  }
  if (overInjury === null) {
    parts.push("부상이 일어나는 각도는 연구 자료가 없어 판단하지 않음");
  } else {
    const label = ref.injuryAngle!.motion;
    parts.push(
      overInjury
        ? `${label} 기준 ${deg(injuryDeg.value!)}에 이름 — 부상 위험 구간`
        : `${label} 기준 ${deg(injuryDeg.value!)}까지 ${deg(injuryDeg.value! - angleDeg)} 남음`,
    );
  }
  // 각도가 아닌 참고 자료(모멘트, 다른 방향)는 출처만 함께 알려 준다
  const related = ref.related.map((r) => `참고: ${r.motion} ${Array.isArray(r.value) ? r.value.join("~") : r.value} ${r.unit}`);

  return {
    trial,
    overNormalDeg,
    overInjury,
    text: [...parts, ...related].join(". "),
    sourceIds: [
      ...new Set([
        ...normalRangeDeg.sourceIds,
        ...injuryDeg.sourceIds,
        ...ref.related.flatMap((r) => r.sourceIds),
      ]),
    ],
  };
}
