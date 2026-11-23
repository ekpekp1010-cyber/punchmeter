// Design Ref: §2.2 처리 ①·② — 기술 정보 + 선수 정보 → 속도·유효 질량·운동량·운동에너지·추정 충격력·강도 지수
// PLAN 작업 6 (계산 연결). 숫자마다 근거(basis)·추정 범위(low~high)·출처(sourceIds)를 함께 돌려준다 (DESIGN §10).
//
// 근거 붙이는 규칙:
//   - 속도: 연구 기본값·범위에서 고르면 "research", 자료 없는 기술에 직접 넣으면 "userInput"
//   - 유효 질량: 연구값(크로스)이면 "research", 분절로 어림하면 "estimated"
//   - 운동량·운동에너지: 재료 중 하나라도 추정이면 "estimated", 사용자 입력이 섞이면 "userInput", 모두 연구면 "research"
//   - 리게인 기준 숫자: 리게인 몸무게 자체가 추정(×1.075)이라 항상 "estimated"
//   - 충격력·강도 지수: 접촉 시간을 walilko2005 평균으로 환산하므로 항상 "estimated"
//   - 강도 지수: 그 기술의 최고 기록이 없으면(무릎) "noData"
// 추정 범위는 유효 질량의 범위(연구 평균 ± 표준편차, 또는 분절 어림의 끝쪽 분절 합~전체 합)에서 나온다.
// 속도는 사용자가 고른 값이라 범위를 넓히지 않는다.

import {
  CONTACT_TIME_S,
  gloveForceFactor,
  gloveMassKg,
  intensityIndex,
  isValidHeight,
  isValidWeighIn,
  kineticEnergy,
  momentum,
  peakForceN,
  regainKg,
  segmentEffectiveMass,
  type GloveFactor,
} from "../physics";
import { MAX_FORCE_RECORD, SEGMENT_SOURCE_IDS, techniqueInfo, type TechniqueInfo } from "../reference";
import type { ByWeight, Estimate, EstimateBasis, Fighter, StrikeStep } from "../types";

/** 계산을 할 수 없는 입력 (화면에서 이 문장을 그대로 보여 준다) */
export class StrikeInputError extends Error {}

export interface StrikeNumbers {
  /** 닿는 순간 속도(m/s) */
  speed: Estimate;
  /** 유효 질량(kg), 펀치는 글러브 무게 포함 */
  effectiveMass: ByWeight;
  /** 운동량(kg·m/s) */
  momentum: ByWeight;
  /** 운동에너지(J) */
  energy: ByWeight;
  /** 추정 충격력(N), 펀치는 글러브 흡수 반영 */
  force: ByWeight;
  /** 타격 강도 지수(0~100) */
  intensityIndex: ByWeight;
  /** 펀치 글러브 보정 내용 */
  glove: GloveFactor;
}

/** 충격 시간 환산값의 출처 */
const CONTACT_TIME_SOURCE = "walilko2005";
/** 글러브 보정값의 출처 */
const GLOVE_SOURCE = "nakano2009";

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** 재료들의 근거를 합친다: 하나라도 추정이면 추정, 사용자 입력이 섞이면 사용자 입력, 모두 연구면 연구 */
function combineBasis(...bases: EstimateBasis[]): EstimateBasis {
  if (bases.includes("noData")) return "noData";
  if (bases.includes("estimated")) return "estimated";
  if (bases.includes("userInput")) return "userInput";
  return "research";
}

/** 값과 범위에 같은 계산을 적용한다 */
function mapEstimate(src: Estimate, fn: (x: number) => number, basis: EstimateBasis, sourceIds: string[]): Estimate {
  return {
    value: src.value === null ? null : fn(src.value),
    low: src.low === undefined ? undefined : fn(src.low),
    high: src.high === undefined ? undefined : fn(src.high),
    basis,
    sourceIds: unique(sourceIds),
  };
}

function checkFighter(f: Fighter) {
  if (!isValidWeighIn(f.weighInKg)) throw new StrikeInputError("계체량은 40~150kg 사이로 넣어 주세요");
  if (!isValidHeight(f.heightCm)) throw new StrikeInputError("키는 140~220cm 사이로 넣어 주세요");
}

/** 속도: 연구 기본값·범위 또는 사용자 입력값 */
function speedEstimate(step: StrikeStep, info: TechniqueInfo): Estimate {
  const v = step.speedMps;
  if (!Number.isFinite(v) || v <= 0) throw new StrikeInputError("속도는 0보다 큰 숫자로 넣어 주세요");
  if (step.speedBasis === "userInput") {
    return { value: v, basis: "userInput", sourceIds: [] };
  }
  if (!info.speed) {
    throw new StrikeInputError("이 기술은 연구 속도 자료가 없어요. 속도를 직접 넣어 주세요");
  }
  const [lo, hi] = info.speed.rangeMps;
  if (v < lo || v > hi) {
    throw new StrikeInputError(`연구 범위(${lo}~${hi} m/s) 안에서 골라 주세요`);
  }
  return { value: v, low: lo, high: hi, basis: "research", sourceIds: info.speed.sourceIds };
}

/** 한 몸무게 기준의 유효 질량 */
function massEstimate(info: TechniqueInfo, attacker: Fighter, bodyMassKg: number, isRegain: boolean): Estimate {
  const glove = info.kind === "punch" ? gloveMassKg(attacker.gloveOz) : 0;
  const ref = info.effectiveMass;
  if (ref.basis === "research") {
    return {
      value: ref.kg + glove,
      low: ref.rangeKg[0] + glove,
      high: ref.rangeKg[1] + glove,
      basis: isRegain ? "estimated" : "research",
      sourceIds: ref.sourceIds,
    };
  }
  const seg = segmentEffectiveMass(ref.segments, bodyMassKg, attacker.sex);
  return {
    value: seg.valueKg + glove,
    low: seg.valueKg + glove,
    high: seg.highKg + glove,
    basis: "estimated",
    sourceIds: SEGMENT_SOURCE_IDS,
  };
}

/** 한 몸무게 기준의 운동량·에너지·충격력·강도 지수 */
function numbersFor(mass: Estimate, speed: Estimate, info: TechniqueInfo, glove: GloveFactor) {
  const v = speed.value as number;
  const base = combineBasis(mass.basis, speed.basis);
  const ids = [...mass.sourceIds, ...speed.sourceIds];

  const momentumE = mapEstimate(mass, (m) => momentum(m, v), base, ids);
  const energyE = mapEstimate(mass, (m) => kineticEnergy(m, v), base, ids);

  const forceIds = [...ids, CONTACT_TIME_SOURCE, ...(glove.basis === "measured" ? [GLOVE_SOURCE] : [])];
  const forceE = mapEstimate(mass, (m) => peakForceN(m, v) * glove.factor, "estimated", forceIds);

  const record = MAX_FORCE_RECORD[info.kind];
  const intensityE: Estimate =
    record === null
      ? { value: null, basis: "noData", sourceIds: [] }
      : mapEstimate(forceE, (f) => intensityIndex(f, info.kind) as number, "estimated", [...forceIds, ...record.sourceIds]);

  return { momentumE, energyE, forceE, intensityE };
}

/**
 * 타격 한 번의 숫자를 계체량 기준과 리게인(×1.075) 기준으로 계산한다.
 * 입력이 잘못되면 StrikeInputError를 던진다.
 */
export function computeStrike(step: StrikeStep, attacker: Fighter): StrikeNumbers {
  checkFighter(attacker);
  const info = techniqueInfo(step.technique);
  const speed = speedEstimate(step, info);
  const glove = gloveForceFactor(attacker.gloveOz, info.kind);

  const massWeighIn = massEstimate(info, attacker, attacker.weighInKg, false);
  const massRegain = massEstimate(info, attacker, regainKg(attacker.weighInKg), true);
  const w = numbersFor(massWeighIn, speed, info, glove);
  const r = numbersFor(massRegain, speed, info, glove);

  // 리게인 기준은 몸무게 자체가 추정이므로 근거를 "추정"으로 바꾼다 (자료 없음은 그대로)
  const asRegain = (e: Estimate): Estimate => (e.basis === "noData" ? e : { ...e, basis: "estimated" });

  return {
    speed,
    effectiveMass: { weighIn: massWeighIn, regain: massRegain },
    momentum: { weighIn: w.momentumE, regain: asRegain(r.momentumE) },
    energy: { weighIn: w.energyE, regain: asRegain(r.energyE) },
    force: { weighIn: w.forceE, regain: asRegain(r.forceE) },
    intensityIndex: { weighIn: w.intensityE, regain: asRegain(r.intensityE) },
    glove,
  };
}

/** 충격 시간 환산값(초). 화면의 "어떻게 계산했나요" 설명에 쓴다 */
export const STRIKE_CONTACT_TIME_S = CONTACT_TIME_S;
