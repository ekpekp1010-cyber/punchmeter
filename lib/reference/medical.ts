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

import type { BodyPart } from "../types";
import type { RefValue } from "./sources";

export interface ThresholdEntry extends RefValue {
  /** PRD의 세 부위 (머리·몸통·다리). 팔은 다리와 같은 "limb" 성격이라 별도 표시 */
  region: BodyPart | "arm";
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

/** 팔·다리 — 힘이 아니라 굽힘 모멘트(N·m) 기준 (넓적다리만 충격 힘 값도 있음) */
export const LIMB_TOLERANCE: ThresholdEntry[] = [
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

/** 자료를 찾지 못했거나 확인하지 못한 항목 */
export const MEDICAL_GAPS: string[] = [
  "갈비뼈 골절을 힘(N) 하나로 나타낸 기준값",
  "사람의 간 손상 기준을 힘(N)으로 나타낸 값",
  "위팔뼈(상완골)와 종아리뼈(비골) 단독 기준",
  "근육 타박상 기준값 (같은 힘에도 결과가 달라 기준이 없음)",
  "훅·어퍼컷·킥의 힘과 머리 가속도 관계",
];
