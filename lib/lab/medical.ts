// Design Ref: §2.2 처리 ③·④ — 맞은 부위 정하기와 의학적 판단
// PLAN 작업 7. 판단은 맞은 부위의 한계 힘(연구값 또는 환산 추정값)과 추정 충격력(리게인 기준)을 비교하고,
// 그 부위에 따로 있는 연구 자료(얼굴뼈 골절 힘, 간 손상, 근육 타박)를 덧붙인다. 근거 연구 id를 함께 돌려준다.
//
// 리게인 기준을 쓰는 이유: 실제 경기 체중에 가깝고, 부위별 누적(PartLoad)도 리게인 기준이라 서로 맞춘다.

import { partThreshold } from "../physics";
import { HEAD_FRACTURE, MUSCLE_CONTUSION, TORSO_FORCE, bodyPartInfo, techniqueInfo } from "../reference";
import type { BodyPart, Fighter, MedicalJudgment, StrikeStep } from "../types";

/**
 * 실제로 맞은 부위.
 * - 수비 "맞음": 노린 부위
 * - 수비 "팔로 막음": 아래팔(로우킥·카프킥은 정강이)
 *   좌우는 노린 부위가 있는 쪽. 가운데 부위(턱·코·명치 등)면 공격 손발의 반대쪽
 *   (마주 본 두 선수가 모두 오소독스라 가정: 뒷손·뒷발 = 오른쪽 → 상대의 왼쪽으로 들어옴).
 */
export function resolveHitPart(step: StrikeStep): { hitPart: BodyPart; outcome: "hit" | "blocked" } {
  if (step.defense === "none") return { hitPart: step.target, outcome: "hit" };
  const side = bodyPartInfo(step.target).side;
  const left = side === "left" || (side === "center" && step.side === "rear");
  const blockedBy = techniqueInfo(step.technique).blockedBy;
  const hitPart: BodyPart =
    blockedBy === "shin" ? (left ? "shinLeft" : "shinRight") : left ? "forearmLeft" : "forearmRight";
  return { hitPart, outcome: "blocked" };
}

/** 부위별로 덧붙일 연구 자료 (얼굴뼈 골절 힘, 간 손상 힘, 근육 타박) */
const EXTRA_SITES: Partial<Record<BodyPart, { list: typeof HEAD_FRACTURE; sites: string[] }>> = {
  nose: { list: HEAD_FRACTURE, sites: ["코뼈"] },
  cheekLeft: { list: HEAD_FRACTURE, sites: ["광대뼈"] },
  cheekRight: { list: HEAD_FRACTURE, sites: ["광대뼈"] },
  jaw: { list: HEAD_FRACTURE, sites: ["아래턱뼈(정면)", "아래턱뼈(옆)"] },
  forehead: { list: HEAD_FRACTURE, sites: ["이마뼈"] },
  templeLeft: { list: HEAD_FRACTURE, sites: ["관자·마루뼈(옆머리)"] },
  templeRight: { list: HEAD_FRACTURE, sites: ["관자·마루뼈(옆머리)"] },
  thighLeft: { list: MUSCLE_CONTUSION, sites: ["허벅지 바깥 근육(가쪽넓은근), 건강한 남성"] },
  thighRight: { list: MUSCLE_CONTUSION, sites: ["허벅지 바깥 근육(가쪽넓은근), 건강한 남성"] },
  calfLeft: { list: MUSCLE_CONTUSION, sites: ["허벅지 바깥 근육(가쪽넓은근), 건강한 남성"] },
  calfRight: { list: MUSCLE_CONTUSION, sites: ["허벅지 바깥 근육(가쪽넓은근), 건강한 남성"] },
};

const n = (x: number) => Math.round(x).toLocaleString("ko-KR");

/** 덧붙이는 연구 자료 한 줄: "코뼈 골절 50% 위험(450~850 N) 범위를 넘는 힘" 같은 문장 */
function extraLines(part: BodyPart, forceN: number): { lines: string[]; sourceIds: string[] } {
  const extra = EXTRA_SITES[part];
  if (!extra) return { lines: [], sourceIds: [] };
  const lines: string[] = [];
  const sourceIds: string[] = [];
  for (const site of extra.sites) {
    const entry = extra.list.find((e) => e.site === site);
    if (!entry) continue;
    const [lo, hi] = Array.isArray(entry.value) ? entry.value : [entry.value, entry.value];
    const range = lo === hi ? `${n(lo)} N` : `${n(lo)}~${n(hi)} N`;
    const where = forceN >= hi ? "보다 큰 힘" : forceN >= lo ? " 안에 드는 힘" : "보다 작은 힘";
    const label = extra.list === MUSCLE_CONTUSION ? `근육 타박 실험(허벅지)에서 부기가 가장 컸던 충격 ${range}` : `${site} ${entry.outcome} ${range}`;
    lines.push(`${label}${where}`);
    sourceIds.push(...entry.sourceIds);
  }
  return { lines, sourceIds };
}

/** 한계 힘 대비 비율로 단계 문장 */
function levelText(ratio: number): string {
  if (ratio >= 1) return "한계 힘을 넘는 충격 — 부상 위험 구간";
  if (ratio >= 0.75) return "한계 힘에 가까운 충격 — 반복되면 부상 위험";
  if (ratio >= 0.5) return "한계 힘의 절반을 넘는 충격";
  return "한 번으로는 한계 힘보다 낮은 충격";
}

/**
 * 맞은 부위의 의학적 판단.
 * forceN은 리게인 기준 추정 충격력(N), defender는 맞은 선수 (성별·키로 한계 힘을 정한다).
 */
export function medicalJudgment(part: BodyPart, forceN: number, defender: Fighter): MedicalJudgment {
  const threshold = partThreshold(part, defender.sex, defender.heightCm);
  const ratio = forceN / threshold.forceN;
  const name = bodyPartInfo(part).nameKo;
  const head = `${name}: 추정 충격력 ${n(forceN)} N은 한계 힘 ${n(threshold.forceN)} N${
    threshold.estimated ? "(환산 추정값)" : ""
  }의 ${Math.round(ratio * 100)}% — ${levelText(ratio)}`;

  const extra = extraLines(part, forceN);
  // 간은 한계 힘 자체가 간 손상 연구값이라 따로 덧붙이지 않는다. 옆 복부 기준은 참고로 알려 준다
  if (part === "liver") {
    const side = TORSO_FORCE.find((e) => e.site === "복부(옆, 간·비장 포함)");
    if (side && typeof side.value === "number") {
      extra.lines.push(`참고: 옆 복부 MAIS 4+ 25% 위험 ${n(side.value)} N`);
      extra.sourceIds.push(...side.sourceIds);
    }
  }

  const text = [head, ...extra.lines].join(". ");
  return {
    part,
    text,
    sourceIds: [...new Set([...threshold.sourceIds, ...extra.sourceIds])],
    estimated: threshold.estimated,
  };
}
