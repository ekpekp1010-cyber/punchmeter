// Design Ref: §8.2-1 연구 재현 / PRD 성공 기준 "연구 재현 ±15% (5개 이상 사례)" (PLAN 작업 22)
// 공개 연구의 참가자 평균 체중·키와 측정 속도를 앱에 넣어, 앱이 계산한 충격력이 연구의 측정값과 얼마나 맞는지 본다.
// 앱 계산식은 이 결과에 맞춰 고치지 않는다 (끼워 맞추면 검증이 아니게 되므로). 결과는 docs/연구재현검증.md에 그대로 적는다.
//
// 공통 가정 (모두 연구에 적혀 있지 않은 것):
//   - 펀치 연구의 글러브 무게는 밝혀지지 않아 10oz로 넣는다 (10oz는 글러브 보정 기준 1이라 무게 0.28 kg만 더해진다)
//   - 성별이 적혀 있지 않으면 남성으로 넣는다

import type { Fighter, StrikeStep, TechniqueId } from "../types";
import { computeStrike } from "./strike";

export interface ReproductionCase {
  id: string;
  /** 무엇을 재현하는지 */
  label: string;
  technique: TechniqueId;
  speedMps: number;
  bodyMassKg: number;
  heightCm: number;
  /** 연구에서 잰 충격력(N) */
  measuredForceN: number;
  sourceIds: string[];
  /** 측정 방법의 차이 등 해석할 때 주의할 점 */
  note: string;
}

export const REPRODUCTION_CASES: ReproductionCase[] = [
  {
    id: "walilko-cross",
    label: "올림픽 복서 스트레이트 (더미 머리)",
    technique: "cross",
    speedMps: 9.14,
    bodyMassKg: 70,
    heightCm: 175,
    measuredForceN: 3427,
    sourceIds: ["walilko2005"],
    note: "유효 질량 2.9 kg과 접촉 시간이 이 연구에서 나왔으므로 기준 사례 (체중은 계산에 쓰이지 않음)",
  },
  {
    id: "liu-elite-jab",
    label: "엘리트 복서 앞손 스트레이트 (힘 측정 표적)",
    technique: "jab",
    speedMps: 7.162,
    bodyMassKg: 76.0,
    heightCm: 181.1,
    measuredForceN: 1507.99,
    sourceIds: ["liu2022a"],
    note: "속도는 주먹 최고 속도(닿는 순간보다 빠를 수 있음)",
  },
  {
    id: "liu-junior-jab",
    label: "주니어 복서 앞손 스트레이트",
    technique: "jab",
    speedMps: 6.317,
    bodyMassKg: 75.47,
    heightCm: 179.7,
    measuredForceN: 1035.45,
    sourceIds: ["liu2022a"],
    note: "속도는 주먹 최고 속도",
  },
  {
    id: "liu-boxer-jab",
    label: "복서 11명 앞손 스트레이트 (닿는 순간 속도)",
    technique: "jab",
    speedMps: 5.63,
    bodyMassKg: 66.06,
    heightCm: 175.3,
    measuredForceN: 1520.8,
    sourceIds: ["liu2022b"],
    note: "닿는 순간 속도라 앱의 정의와 가장 가깝다",
  },
  {
    id: "dinu-elite-hook",
    label: "엘리트 복서 뒷손 훅",
    technique: "hook",
    speedMps: 11.2,
    bodyMassKg: 73.6,
    heightCm: 179,
    measuredForceN: 2999,
    sourceIds: ["dinu2020"],
    note: "연구의 힘도 관성 센서로 추정한 값 (직접 잰 힘이 아님)",
  },
  {
    id: "dinu-elite-uppercut",
    label: "엘리트 복서 뒷손 어퍼컷",
    technique: "uppercut",
    speedMps: 10.2,
    bodyMassKg: 73.6,
    heightCm: 179,
    measuredForceN: 3242,
    sourceIds: ["dinu2020"],
    note: "연구의 힘도 관성 센서 추정값",
  },
  {
    id: "dinu-junior-hook",
    label: "주니어 복서 뒷손 훅",
    technique: "hook",
    speedMps: 8.9,
    bodyMassKg: 61.0,
    heightCm: 175,
    measuredForceN: 544,
    sourceIds: ["dinu2020"],
    note: "연구의 힘도 관성 센서 추정값. 주니어는 몸 전체를 싣지 못해 힘이 매우 낮게 나옴",
  },
  {
    id: "vagner-front",
    label: "군인 앞차기 (힘 측정판)",
    technique: "frontKick",
    speedMps: 7.7,
    bodyMassKg: 83.8,
    heightCm: 180.5,
    measuredForceN: 2202,
    sourceIds: ["vagner2019"],
    note: "연구 값은 최대 힘이 아니라 평균 충격 힘",
  },
  {
    id: "gavagan-mt-high",
    label: "무에타이 머리 높이 돌려차기 (패드)",
    technique: "highKick",
    speedMps: 7.22,
    bodyMassKg: 65.6,
    heightCm: 174.6,
    measuredForceN: 1400,
    sourceIds: ["gavagan2017"],
    note: "패드를 찬 힘이라 패드가 충격을 흡수한다",
  },
  {
    id: "praphanbundit-middle",
    label: "무에타이 미들킥 (패드 속 센서)",
    technique: "middleKick",
    speedMps: 14.36,
    bodyMassKg: 60.57,
    heightCm: 170,
    measuredForceN: 6321.43,
    sourceIds: ["praphanbundit2020"],
    note: "키는 밝히지 않아 170 cm로 넣음(유효 질량에는 영향 없음). 같은 연구의 N/kg 값(94.71)으로 환산하면 5736 N",
  },
];

export interface ReproductionResult {
  case: ReproductionCase;
  /** 앱이 계산한 충격력(N, 계체량 기준) */
  appForceN: number;
  /** (앱 − 연구) ÷ 연구 × 100 */
  errorPct: number;
  within15: boolean;
}

/** 사례 하나를 앱 계산으로 재현 */
export function reproduce(c: ReproductionCase): ReproductionResult {
  const fighter: Fighter = { id: "A", sex: "male", weighInKg: c.bodyMassKg, heightCm: c.heightCm, gloveOz: 10 };
  const step: StrikeStep = {
    attacker: "A",
    technique: c.technique,
    side: "rear",
    target: "abdomen",
    speedMps: c.speedMps,
    // 연구 속도가 앱의 조절 범위 밖일 수 있어 사용자 입력값으로 넣는다 (계산식은 같음)
    speedBasis: "userInput",
    defense: "none",
  };
  const appForceN = computeStrike(step, fighter).force.weighIn.value as number;
  const errorPct = ((appForceN - c.measuredForceN) / c.measuredForceN) * 100;
  return { case: c, appForceN, errorPct, within15: Math.abs(errorPct) <= 15 };
}
