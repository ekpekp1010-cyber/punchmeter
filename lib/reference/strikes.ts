// Design Ref: §3 참고값 자료 파일 — 타격의 유효 질량, 속도·충격력 범위, 공개 최고 충격력 기록
// PLAN 작업 2. 계산 방법(PLAN 작업 3)은 이 파일의 값을 가져다 쓴다.
//
// 주의: "유효 질량"은 연구마다 계산 방법이 두 가지이고, 결과가 약 10배 차이 난다.
//   - impulse: 충격량 ÷ 주먹 속도 → 약 2~3kg. "운동량 = 유효 질량 × 속도"에 맞는 방법
//   - forceAccel: 최대 충격력 ÷ 주먹 가속도 → 약 13~31kg (체중의 18~85%)
// 한 계산 모델 안에서 두 방법의 값을 섞어 쓰지 않는다.

import type { RefValue } from "./sources";

export type EffectiveMassMethod = "impulse" | "forceAccel";

export type StrikeKind =
  | "straightPunch"
  | "jab"
  | "cross"
  | "hook"
  | "uppercut"
  | "roundhouseKick"
  | "sideKick"
  | "frontKick";

export interface EffectiveMassEntry extends RefValue {
  strike: StrikeKind;
  method: EffectiveMassMethod;
  /** 측정 대상 (선수 수준, 인원) */
  population: string;
}

/** 타격 종류별 유효 질량. 단위가 "kg"(절대값)과 "%BM"(체중 대비 %)으로 섞여 있다 */
export const EFFECTIVE_MASS: EffectiveMassEntry[] = [
  {
    strike: "straightPunch",
    method: "impulse",
    value: 2.9,
    unit: "kg",
    population: "올림픽 복서 7명, 5개 체급, 스트레이트 18회 (더미 얼굴)",
    sourceIds: ["walilko2005"],
    confidence: "high",
    verifiedPrimary: true,
    note: "표준편차 ±2.0kg. 체급이 높을수록 커진다고 보고됨",
  },
  {
    strike: "straightPunch",
    method: "impulse",
    value: 2.93,
    unit: "kg",
    population: "훈련받지 않은 남성 29명, 주로 쓰는 손",
    sourceIds: ["adamec2021"],
    confidence: "high",
    verifiedPrimary: true,
    note: "남녀 전체 50명은 2.60kg",
  },
  {
    strike: "jab",
    method: "forceAccel",
    value: 21.51,
    unit: "%BM",
    population: "남자 복서 13명, 평균 체중 90.6kg",
    sourceIds: ["mosler2024"],
    confidence: "high",
    verifiedPrimary: true,
    note: "절대값 18.95 ± 5.29kg",
  },
  {
    strike: "cross",
    method: "forceAccel",
    value: 21.04,
    unit: "%BM",
    population: "남자 복서 13명, 평균 체중 90.6kg",
    sourceIds: ["mosler2024"],
    confidence: "high",
    verifiedPrimary: true,
    note: "절대값 18.50 ± 5.56kg",
  },
  {
    strike: "hook",
    method: "forceAccel",
    value: [12.56, 14.38],
    unit: "kg",
    population: "훈련된 남자 복서 30명 (뒷손 / 앞손 훅)",
    sourceIds: ["kacprzak2025"],
    confidence: "low",
    verifiedPrimary: false,
    note: "검색 요약에서만 확인. 원문 페이지를 열지 못함",
  },
  {
    strike: "roundhouseKick",
    method: "forceAccel",
    value: [18, 20.12],
    unit: "%BM",
    population: "ITF 태권도 선수 (여자 엘리트 5명 18%, 남자 4명 중앙값 20.12%)",
    sourceIds: ["gora2025", "gora2024"],
    confidence: "high",
    verifiedPrimary: true,
  },
  {
    strike: "sideKick",
    method: "forceAccel",
    value: [73.09, 85],
    unit: "%BM",
    population: "ITF 태권도 선수 (위 두 연구)",
    sourceIds: ["gora2025", "gora2024"],
    confidence: "high",
    verifiedPrimary: true,
  },
  {
    strike: "frontKick",
    method: "forceAccel",
    value: 44,
    unit: "%BM",
    population: "ITF 마스터 1명, 체중 60kg",
    sourceIds: ["wasik2023"],
    confidence: "medium",
    verifiedPrimary: true,
    note: "1명만 측정",
  },
];

/** 유효 질량 자료를 찾지 못한 타격 */
export const EFFECTIVE_MASS_MISSING: StrikeKind[] = ["uppercut"];

export interface BenchmarkEntry extends RefValue {
  strike: StrikeKind;
  measure: "velocity" | "peakForce";
  population: string;
}

/** 공개된 속도·최대 충격력 범위. 결과가 그럴듯한지 확인할 때 쓴다 */
export const STRIKE_BENCHMARKS: BenchmarkEntry[] = [
  {
    strike: "straightPunch",
    measure: "velocity",
    value: 9.14,
    unit: "m/s",
    population: "올림픽 복서",
    sourceIds: ["walilko2005"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±2.06 m/s",
  },
  {
    strike: "straightPunch",
    measure: "peakForce",
    value: 3427,
    unit: "N",
    population: "올림픽 복서",
    sourceIds: ["walilko2005"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±811 N, 머리 가속도 58 ± 13g",
  },
  {
    strike: "cross",
    measure: "peakForce",
    value: [2381, 4800],
    unit: "N",
    population: "초보 2381 / 중급 3722 / 엘리트 4800 (평균)",
    sourceIds: ["smith2000"],
    confidence: "high",
    verifiedPrimary: true,
    note: "값은 평균 ± 표준오차",
  },
  {
    strike: "jab",
    measure: "peakForce",
    value: [1604, 2847],
    unit: "N",
    population: "초보 1604 / 중급 2283 / 엘리트 2847 (평균)",
    sourceIds: ["smith2000"],
    confidence: "high",
    verifiedPrimary: true,
  },
  {
    strike: "cross",
    measure: "velocity",
    value: 8.22,
    unit: "m/s",
    population: "복서 10명 (지역~유럽 수준)",
    sourceIds: ["piorkowski2011"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±1.08 m/s. 훅이 스트레이트보다 빠르다고 보고됨 (훅 수치는 찾지 못함)",
  },
  {
    strike: "cross",
    measure: "peakForce",
    value: 4096,
    unit: "N",
    population: "프로 헤비급 1명 (속도 8.9 m/s)",
    sourceIds: ["atha1985"],
    confidence: "high",
    verifiedPrimary: true,
  },
  {
    strike: "roundhouseKick",
    measure: "peakForce",
    value: [5419, 6400],
    unit: "N",
    population: "숙련된 태권도 선수 5명 (머리 높이 5419 / 몸통 높이 6400)",
    sourceIds: ["osullivan2009"],
    confidence: "high",
    verifiedPrimary: true,
  },
  {
    strike: "roundhouseKick",
    measure: "velocity",
    value: [6.9, 18.3],
    unit: "m/s",
    population: "연구 88편 리뷰의 범위",
    sourceIds: ["corcoran2024"],
    confidence: "high",
    verifiedPrimary: true,
    note: "같은 리뷰의 충격력 범위는 172~6400 N",
  },
];

/**
 * 타격 강도 지수 100점 기준 (PRD: 펀치·킥별 공개 최고 충격력 기록 = 100).
 * 두 값 모두 리뷰 논문의 인용으로만 확인했다. 원 논문을 확인하면 verifiedPrimary를 바꾼다.
 */
export const MAX_FORCE_RECORD: Record<"punch" | "kick", RefValue> = {
  punch: {
    value: 5358,
    unit: "N",
    sourceIds: ["pierce2006", "corcoran2024"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "프로 경기 6경기 중 스트레이트 펀치. 실험실에서 직접 확인한 엘리트 평균은 4800 N (smith2000)",
  },
  kick: {
    value: 9015,
    unit: "N",
    sourceIds: ["pedzich2006", "corcoran2024"],
    confidence: "medium",
    verifiedPrimary: false,
    note: "옆차기. 돌려차기 최고값은 6400 N (osullivan2009)",
  },
};
