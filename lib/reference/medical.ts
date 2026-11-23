// Design Ref: §3 참고값 자료 파일 — 의학적 판단 기준값
// PLAN 작업 2. PRD: 의학적 판단은 공개된 연구의 기준값과 비교하고 근거 연구를 함께 표시한다.
//
// 주의:
//   - 얼굴뼈 값은 대부분 "골절이 일어난 힘의 범위"이지 50% 위험값이 아니다 (코뼈만 위험 곡선 있음).
//   - 뇌진탕 기준은 힘(N)이 아니라 머리 가속도(g, rad/s²)다. 펀치 힘과 머리 가속도를 함께 잰 연구는
//     walilko2005(더미, 스트레이트만) 하나뿐이다.
//   - 몸통은 힘이 아니라 압축률(%)이나 VC(m/s)로 기준이 나온다.
//   - 팔·다리는 힘이 아니라 굽힘 모멘트(N·m)로 기준이 나온다. 힘으로 바꾸려면 받침 간격을 가정해야 하므로
//     바꾼 값은 앱의 추정이 된다.

import type { BodyPart, BodyRegion } from "../types";
import type { RefValue } from "./sources";

export interface ThresholdEntry extends RefValue {
  /** 신체 구역 (머리·몸통·팔·다리) */
  region: BodyRegion;
  /** 세부 부위 (예: 코뼈, 광대뼈) */
  site: string;
  /** 무엇이 일어나는 기준인지 */
  outcome: string;
  /** 측정 조건 */
  loading: string;
}

/** 머리: 얼굴·두개골 골절 힘 (사체 실험) */
export const HEAD_FRACTURE: ThresholdEntry[] = [
  {
    region: "head",
    site: "코뼈",
    outcome: "골절 50% 위험",
    value: [450, 850],
    unit: "N",
    loading: "앞→뒤 방향 평평한 충격체, 남성 사체",
    sourceIds: ["cormier2010"],
    confidence: "high",
    verifiedPrimary: true,
    note: "얼굴뼈 중 유일한 위험 곡선 값",
  },
  {
    region: "head",
    site: "위턱뼈(상악)",
    outcome: "골절이 일어난 힘의 범위",
    value: [625, 1980],
    unit: "N",
    loading: "6.5cm² 원판, 3~5.4 m/s",
    sourceIds: ["bass2015"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "얼굴뼈 중 가장 약함 (Schneider & Nahum 1972)",
  },
  {
    region: "head",
    site: "광대뼈",
    outcome: "골절이 일어난 힘의 범위",
    value: [930, 2850],
    unit: "N",
    loading: "6.5cm² 원판, 3~5.2 m/s",
    sourceIds: ["bass2015"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "Schneider & Nahum 1972. 다른 연구는 610~3470 N, 900~2400 N",
  },
  {
    region: "head",
    site: "아래턱뼈(옆)",
    outcome: "골절이 일어난 힘의 범위",
    value: [820, 3400],
    unit: "N",
    loading: "25cm² 평판, 5.4~6.0 m/s",
    sourceIds: ["bass2015"],
    confidence: "medium",
    verifiedPrimary: false,
  },
  {
    region: "head",
    site: "아래턱뼈(정면)",
    outcome: "골절이 일어난 힘의 범위",
    value: [1900, 4100],
    unit: "N",
    loading: "6.5cm² 원판",
    sourceIds: ["bass2015"],
    confidence: "medium",
    verifiedPrimary: false,
  },
  {
    region: "head",
    site: "이마뼈",
    outcome: "골절이 일어난 힘의 범위",
    value: [2670, 9880],
    unit: "N",
    loading: "6.5cm² 원판, 3.1~7.1 m/s, 21개",
    sourceIds: ["bass2015"],
    confidence: "medium",
    verifiedPrimary: false,
  },
  {
    region: "head",
    site: "관자·마루뼈(옆머리)",
    outcome: "골절 평균 힘 (남성)",
    value: 3944,
    unit: "N",
    loading: "질량 충격, 사체 10구",
    sourceIds: ["bass2015"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "±1287 N. 여성 3123 ± 623 N. 제안 최소값 남 2450 / 여 2000 N (Nahum 1968)",
  },
];

export interface ConcussionEntry extends RefValue {
  metric: "linearAccel" | "angularAccel";
  /** 위험 확률 (%) */
  riskPct: number;
}

/** 뇌진탕(가벼운 뇌손상) 위험 — 머리 가속도 기준 (NFL 충돌 재구성) */
export const CONCUSSION_RISK: ConcussionEntry[] = [
  { metric: "linearAccel", riskPct: 25, value: 57, unit: "g", sourceIds: ["king2003"], confidence: "high", verifiedPrimary: true, note: "559 m/s²" },
  { metric: "linearAccel", riskPct: 50, value: 79, unit: "g", sourceIds: ["king2003"], confidence: "high", verifiedPrimary: true, note: "778 m/s²" },
  { metric: "linearAccel", riskPct: 75, value: 98, unit: "g", sourceIds: ["king2003"], confidence: "high", verifiedPrimary: true, note: "965 m/s²" },
  { metric: "angularAccel", riskPct: 25, value: 4384, unit: "rad/s²", sourceIds: ["king2003"], confidence: "high", verifiedPrimary: true },
  { metric: "angularAccel", riskPct: 50, value: 5757, unit: "rad/s²", sourceIds: ["king2003"], confidence: "high", verifiedPrimary: true },
  { metric: "angularAccel", riskPct: 75, value: 7130, unit: "rad/s²", sourceIds: ["king2003"], confidence: "high", verifiedPrimary: true },
];

/**
 * 펀치 힘 ↔ 머리 가속도를 잇는 유일한 자료 (올림픽 복서 스트레이트, 더미).
 * 펀치 3427 ± 811 N일 때 머리 58 ± 13g, 6343 ± 1789 rad/s², 턱 하중 876 ± 288 N.
 * 훅·어퍼컷·킥에는 이 관계를 확인한 자료가 없다.
 */
export const PUNCH_TO_HEAD_BRIDGE = {
  punchForceN: 3427,
  headLinearG: 58,
  headAngularRadS2: 6343,
  jawLoadN: 876,
  sourceIds: ["walilko2005"],
  confidence: "high" as const,
  verifiedPrimary: true,
};

/** 중력가속도 (m/s²). g 단위를 m/s²로 바꿀 때 쓴다 */
export const G_TO_MS2 = 9.80665;

/**
 * 머리 유효 질량(kg) — 뇌진탕 가속도 기준을 힘으로 환산할 때 쓴다 (환산 추정값).
 * walilko2005의 평균값으로 계산: 3427 N ÷ (58g × 9.80665) ≈ 6.03kg.
 * de Leva 1996의 머리 무게(73kg 남성 약 5.1kg)보다 큰 것은 목이 함께 끌려가기 때문으로 본다.
 * 얼굴 정면 스트레이트에서만 확인된 관계다.
 */
export const HEAD_EFFECTIVE_MASS_KG =
  PUNCH_TO_HEAD_BRIDGE.punchForceN / (PUNCH_TO_HEAD_BRIDGE.headLinearG * G_TO_MS2);

/**
 * 굽힘 모멘트(N·m)를 힘(N)으로 바꾸는 식 (3점 굽힘, 양 끝 받침 가정).
 * 맞은 지점이 시작 관절에서 a(m), 뼈 길이 L(m)일 때 힘 = 모멘트 × L ÷ (a × (L − a)).
 * 가운데(a = L/2)를 맞으면 힘 = 4 × 모멘트 ÷ L 이 된다.
 * 검증: 넓적다리 395 N·m, 길이 0.422m → 약 3,740 N. 실제로 잰 힘 4,180~4,780 N과 10~20% 차이.
 */
export const MOMENT_TO_FORCE_NOTE =
  "힘 = 모멘트 × L ÷ (a × (L − a)), 가운데를 맞으면 4 × 모멘트 ÷ L (환산 추정값)";

/** 몸통 — 힘이 아니라 VC(m/s) 또는 압축률(%) 기준 */
export const TORSO_TOLERANCE: ThresholdEntry[] = [
  {
    region: "torso",
    site: "가슴(옆)",
    outcome: "심각한 부상 25% 위험",
    value: 1.47,
    unit: "VC m/s",
    loading: "23.4kg 진자, 4.5~9.4 m/s, 사체 14구",
    sourceIds: ["vianoLateral1989"],
    confidence: "high",
    verifiedPrimary: true,
    note: "압축률 38%",
  },
  {
    region: "torso",
    site: "복부(옆, 간·비장 포함)",
    outcome: "심각한 부상 25% 위험",
    value: 1.98,
    unit: "VC m/s",
    loading: "위와 같음",
    sourceIds: ["vianoLateral1989"],
    confidence: "high",
    verifiedPrimary: true,
    note: "압축률 44%",
  },
  {
    region: "torso",
    site: "가슴(정면)",
    outcome: "AIS 4 이상 25% 위험",
    value: 1.0,
    unit: "VC m/s",
    loading: "정면 둔탁한 충격",
    sourceIds: ["lauViano1986"],
    confidence: "high",
    verifiedPrimary: true,
  },
  {
    region: "torso",
    site: "복부(정면)",
    outcome: "AIS 5 이상 25% 위험",
    value: 1.2,
    unit: "VC m/s",
    loading: "정면 둔탁한 충격",
    sourceIds: ["lauViano1986"],
    confidence: "high",
    verifiedPrimary: true,
  },
];

/**
 * 몸통 옆(옆구리) — 힘(N)으로 나온 기준. 옆 충격 리뷰(yoganandan2007)의 인용으로 확인한 값이다.
 * 몸통 앞(정면)은 사람에게서 잰 힘·강성 값을 원문으로 확인하지 못했다 (MEDICAL_GAPS 참고).
 */
export const TORSO_FORCE: ThresholdEntry[] = [
  {
    region: "torso",
    site: "가슴(옆)",
    outcome: "MAIS 4 이상 25% 위험",
    value: 5480,
    unit: "N",
    loading: "23.4kg 진자, 사체 (Viano 1989, SAE 892432)",
    sourceIds: ["yoganandan2007"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "리뷰의 인용으로 확인. 원 논문은 열지 못함",
  },
  {
    region: "torso",
    site: "복부(옆, 간·비장 포함)",
    outcome: "MAIS 4 이상 25% 위험",
    value: 6730,
    unit: "N",
    loading: "23.4kg 진자, 사체 (Viano 1989, SAE 892432)",
    sourceIds: ["yoganandan2007"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "리뷰의 인용으로 확인. 원 논문은 열지 못함",
  },
  {
    region: "torso",
    site: "가슴·복부(옆), 50번째 백분위 남성",
    outcome: "AIS 4 이상",
    value: 3000,
    unit: "N",
    loading: "썰매 충돌 실험 (Cavanaugh 1993). 5번째 여성 2160 N, 95번째 남성 3640 N",
    sourceIds: ["yoganandan2007"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "진자가 아니라 썰매 실험이라 타격과 조건이 더 다름",
  },
  // ── PLAN 작업 4에서 추가 ──
  {
    region: "torso",
    site: "가슴(정면, 복장뼈 가운데), 남성",
    outcome: "중간 에너지 충격의 평균 최대 힘 (이때 평균 압축률 38.8% > AIS 3+ 50% 위험 압축률 35%)",
    value: 4910,
    unit: "N",
    loading: "지름 150 mm 충격체, 1.6~23.6 kg, 4.0~14.5 m/s, 사체 11구 (약 600 J 묶음)",
    sourceIds: ["kimpara2003"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±2280 N. 논문은 힘이 아니라 압축률·변위를 부상 예측값으로 골랐다. 낮은 에너지(약 200 J) 묶음은 3050 ± 1470 N, 압축률 29.6%",
  },
  {
    region: "torso",
    site: "가슴(정면, 복장뼈 가운데), 여성",
    outcome: "중간 에너지 충격의 평균 최대 힘 (이때 평균 압축률 45.1% > AIS 3+ 50% 위험 압축률 36%)",
    value: 4170,
    unit: "N",
    loading: "위와 같은 실험, 사체 5구",
    sourceIds: ["kimpara2003"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±1110 N",
  },
  {
    region: "torso",
    site: "간 (갈비뼈 아래쪽 비스듬한 충격)",
    outcome: "심각한 간 손상",
    value: [1900, 2100],
    unit: "N",
    loading: "사체 비스듬한 진자 충격, 변위 60~85 mm (Yoganandan 1996)",
    sourceIds: ["yoganandan2000"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "인용한 논문(Yoganandan 2000)의 문장으로 확인. 옆 복부 6730 N(MAIS 4+ 25%)보다 훨씬 낮다",
  },
];

/** 가슴 정면 압축률 기준 (힘이 아니라 가슴이 눌린 비율) */
export const FRONTAL_CHEST_COMPRESSION: ThresholdEntry[] = [
  {
    region: "torso",
    site: "가슴(정면)",
    outcome: "AIS 3+ 50% 위험",
    value: 35,
    unit: "% (남성) — 여성 36%",
    loading: "사체 정면 진자 충격 자료 정리. 변위로는 남 81 mm / 여 68 mm",
    sourceIds: ["kimpara2003"],
    confidence: "high",
    verifiedPrimary: true,
  },
];

/** 근육 타박(멍·부기) — 뼈 부상 기준보다 훨씬 낮은 힘에서 일어난다. 의학적 판단 문장에 참고로 쓴다 */
export const MUSCLE_CONTUSION: ThresholdEntry[] = [
  {
    region: "leg",
    site: "허벅지 바깥 근육(가쪽넓은근), 건강한 남성",
    outcome: "부기(부종)가 가장 크게 생긴 충격 (7.2 kg 낙하)",
    value: 1681,
    unit: "N",
    loading: "지름 10 cm 단단한 공, 67 cm 높이에서 낙하, 남성 32명 (4.2~7.2 kg 네 가지 무게)",
    sourceIds: ["barnes2022"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±235.6 N. 50% 위험 기준이 아니라 '이 정도 충격에서 부기가 가장 컸다'는 실험 결과. 6.2 kg은 1691 N",
  },
];

/** 심장 진탕(가슴에 맞아 심장이 멈추는 현상) — 힘이 아니라 공 속도 기준이라 펀치와 바로 비교할 수 없다 */
export const COMMOTIO_CORDIS_NOTE =
  "어린 돼지 실험에서 야구공 시속 40~48 km(25~30 mph)부터 심실세동이 생기고 64 km/h(40 mph)에서 약 70%로 가장 잦았다. 심장 박동의 특정 순간(T파 정점 10~30 ms 전)에 맞을 때만 일어난다 (link2003). 힘(N) 기준이 없어 계산에는 쓰지 않는다.";

/** 팔·다리 — 힘이 아니라 굽힘 모멘트(N·m) 기준 (넓적다리만 충격 힘 값도 있음) */
export const LIMB_TOLERANCE: ThresholdEntry[] = [
  {
    region: "arm",
    site: "위팔(위팔뼈), 50번째 백분위 남성",
    outcome: "골절 50% 위험",
    value: 257,
    unit: "N·m",
    loading: "굽힘, 사체",
    sourceIds: ["santago2008"],
    confidence: "high",
    verifiedPrimary: true,
    note: "25% 위험 214 N·m, 75% 위험 296 N·m. 다른 연구(kirkish1996)는 230 N·m · 전단 2.5kN",
  },
  {
    region: "arm",
    site: "위팔(위팔뼈), 5번째 백분위 여성",
    outcome: "골절",
    value: 128,
    unit: "N·m",
    loading: "동적 3점 굽힘, 사체",
    sourceIds: ["duma1999"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±19 N·m. kirkish1996의 5번째 여성 값은 130 N·m",
  },
  {
    region: "arm",
    site: "아래팔(전완)",
    outcome: "골절 평균",
    value: 94,
    unit: "N·m",
    loading: "3점 굽힘, 3.3·7.6 m/s, 사체 30구",
    sourceIds: ["pintar1998"],
    confidence: "high",
    verifiedPrimary: true,
    note: "체격이 작고 골밀도가 낮으면 약 45 N·m",
  },
  {
    region: "leg",
    site: "정강이뼈(가운데)",
    outcome: "골절",
    value: 320,
    unit: "N·m",
    loading: "32kg 충격체, 지름 25mm 원통",
    sourceIds: ["nyquist1985"],
    confidence: "high",
    verifiedPrimary: true,
    note: "남성 기준. 여성 약 280 N·m",
  },
  {
    region: "leg",
    site: "넓적다리뼈(옆)",
    outcome: "골절 시 충격 힘",
    value: 4780,
    unit: "N",
    loading: "3점 낙하, 9.8kg · 5 m/s, 사체 넓적다리뼈 45개",
    sourceIds: ["kennedy2004"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±792 N",
  },
];

/**
 * 부위 22곳의 한계 힘을 무엇으로 정할지 (PLAN 작업 7에서 이 표대로 계산한다).
 * 작업 2에서 12곳 → 22곳으로 나누면서, 새로 생긴 부위는 우선 이미 확인한 기준을 그대로 이어 쓴다
 * (머리 7곳 = 뇌진탕 기준, 명치·복부 = 정면 자료 없어 빌림, 종아리·정강이 = 정강이뼈 기준).
 * 부위별로 더 맞는 연구값은 PLAN 작업 4(연구값 보강)에서 찾는다.
 * - force: 연구값이 이미 힘(N)
 * - moment: 굽힘 모멘트를 힘으로 환산 (MOMENT_TO_FORCE_NOTE)
 * - headAccel: 뇌진탕 50% 위험 가속도 × HEAD_EFFECTIVE_MASS_KG
 * - borrowed: 그 부위 자료가 없어 다른 부위·방향 값을 빌림 ("추정" 표시)
 * 왼·오른쪽은 같은 기준을 쓴다.
 */
export interface PartThresholdPlan {
  method: "force" | "moment" | "headAccel" | "borrowed";
  /** 기준값. force·borrowed는 N, moment는 N·m, headAccel은 m/s² */
  value: { male: number; female: number };
  /** moment 방식일 때 뼈 길이를 구할 분절 (segments.ts) */
  boneSegment?: "upperArm" | "forearm" | "shank";
  basis: string;
  sourceIds: string[];
}

const HEAD_PLAN: PartThresholdPlan = {
  method: "headAccel",
  value: { male: 778, female: 778 },
  basis: "뇌진탕 50% 위험 778 m/s² × 머리 유효 질량 (얼굴뼈 골절 힘은 의학적 판단에 따로 표시)",
  sourceIds: ["king2003", "walilko2005"],
};
const FLANK_PLAN: PartThresholdPlan = {
  method: "force",
  value: { male: 5480, female: 5480 },
  basis: "옆 가슴 5480 N (옆 복부 6730 N보다 낮은 값을 씀)",
  sourceIds: ["yoganandan2007"],
};
const UPPER_ARM_PLAN: PartThresholdPlan = {
  method: "moment",
  value: { male: 257, female: 128 },
  boneSegment: "upperArm",
  basis: "위팔뼈 남 257 N·m (50% 위험) / 여 128 N·m",
  sourceIds: ["santago2008", "duma1999"],
};
const FOREARM_PLAN: PartThresholdPlan = {
  method: "moment",
  value: { male: 94, female: 94 },
  boneSegment: "forearm",
  basis: "아래팔 94 N·m (남녀 구분 없는 평균)",
  sourceIds: ["pintar1998"],
};
const THIGH_PLAN: PartThresholdPlan = {
  method: "force",
  value: { male: 4780, female: 4780 },
  basis: "넓적다리뼈 옆 충격 4780 N",
  sourceIds: ["kennedy2004"],
};
const LOWER_LEG_PLAN: PartThresholdPlan = {
  method: "moment",
  value: { male: 320, female: 280 },
  boneSegment: "shank",
  basis: "정강이뼈 남 320 N·m / 여 280 N·m",
  sourceIds: ["nyquist1985"],
};

const LIVER_PLAN: PartThresholdPlan = {
  method: "force",
  value: { male: 1900, female: 1900 },
  basis: "갈비뼈 아래쪽 비스듬한 충격에서 심각한 간 손상 1.9~2.1 kN 중 낮은 값 (작업 4: 옆 복부 6730 N에서 바꿈)",
  sourceIds: ["yoganandan2000"],
};
const FRONT_CHEST_PLAN: PartThresholdPlan = {
  method: "borrowed",
  value: { male: 4910, female: 4170 },
  basis:
    "정면 가슴 충격에서 평균 압축률이 AIS 3+ 50% 위험 압축률을 넘은 묶음의 평균 최대 힘 (남 4910 N / 여 4170 N). 힘 자체의 위험 기준이 아니라 추정",
  sourceIds: ["kimpara2003"],
};
const FRONT_ABDOMEN_PLAN: PartThresholdPlan = {
  ...FRONT_CHEST_PLAN,
  basis: "정면 복부의 힘 기준 자료 없음 → 정면 가슴 값(남 4910 N / 여 4170 N)을 빌려 씀",
};

export const PART_THRESHOLD_PLAN: Record<BodyPart, PartThresholdPlan> = {
  jaw: HEAD_PLAN,
  nose: HEAD_PLAN,
  cheekLeft: HEAD_PLAN,
  cheekRight: HEAD_PLAN,
  forehead: HEAD_PLAN,
  templeLeft: HEAD_PLAN,
  templeRight: HEAD_PLAN,
  solarPlexus: FRONT_CHEST_PLAN,
  ribsLeft: FLANK_PLAN,
  ribsRight: FLANK_PLAN,
  liver: LIVER_PLAN,
  abdomen: FRONT_ABDOMEN_PLAN,
  upperArmLeft: UPPER_ARM_PLAN,
  upperArmRight: UPPER_ARM_PLAN,
  forearmLeft: FOREARM_PLAN,
  forearmRight: FOREARM_PLAN,
  thighLeft: THIGH_PLAN,
  thighRight: THIGH_PLAN,
  calfLeft: { ...LOWER_LEG_PLAN, basis: `${LOWER_LEG_PLAN.basis} (종아리 근육 단독 기준 없음 → 정강이뼈 기준을 씀)` },
  calfRight: { ...LOWER_LEG_PLAN, basis: `${LOWER_LEG_PLAN.basis} (종아리 근육 단독 기준 없음 → 정강이뼈 기준을 씀)` },
  shinLeft: LOWER_LEG_PLAN,
  shinRight: LOWER_LEG_PLAN,
};

/** 자료를 찾지 못했거나 확인하지 못한 항목 */
export const MEDICAL_GAPS: string[] = [
  "명치 단독의 힘 기준. 지금은 정면 가슴 충격 자료(kimpara2003)로 추정",
  "정면 복부의 힘 기준 (Cavanaugh 1986 막대 충격은 힘과 부상의 관계를 내지 못함). 지금은 정면 가슴 값을 빌려 씀",
  "종아리뼈(비골) 단독의 동적 기준, 종아리 근육 타박 기준 (허벅지 근육 자료만 있음)",
  "근육 타박의 50% 위험 기준 (barnes2022는 무게별 결과만 있음)",
  "심장 진탕의 힘(N) 기준 (공 속도 기준만 있음)",
  "훅·어퍼컷·킥의 힘과 머리 가속도 관계",
];
