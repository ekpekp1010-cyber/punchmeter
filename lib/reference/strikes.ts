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
  | "lowKick"
  | "middleKick"
  | "highKick"
  | "sideKick"
  | "frontKick"
  | "elbow"
  | "knee";

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
    strike: "jab",
    method: "forceAccel",
    value: 30.39,
    unit: "kg",
    population: "훈련된 남자 복서 30명",
    sourceIds: ["kacprzak2025"],
    confidence: "medium",
    verifiedPrimary: true,
    note: "±15.09kg (초록에서 확인). 같은 방법의 mosler2024 잽 18.95kg과 차이가 크다",
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

/**
 * 유효 질량 자료를 찾지 못한 타격 (PLAN 작업 4에서 다시 찾아봄).
 * 운동량 계산에 맞는 impulse 방법 값은 스트레이트(walilko2005·adamec2021)에만 있다.
 * 나머지 기술은 PLAN 작업 6에서 분절 비율표(de Leva)로 어림하고 "추정"으로 표시한다.
 */
export const EFFECTIVE_MASS_MISSING: StrikeKind[] = ["uppercut", "elbow", "knee"];
export const EFFECTIVE_MASS_IMPULSE_MISSING: StrikeKind[] = [
  "jab",
  "hook",
  "uppercut",
  "roundhouseKick",
  "lowKick",
  "middleKick",
  "highKick",
  "sideKick",
  "frontKick",
  "elbow",
  "knee",
];

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
  // ── PLAN 작업 4 (연구값 보강)에서 추가: 기술별 속도 ──
  {
    strike: "jab",
    measure: "velocity",
    value: 5.63,
    unit: "m/s",
    population: "복서 11명, 앞손 스트레이트, 닿는 순간 속도",
    sourceIds: ["liu2022b"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±0.584 m/s. 뻗는 중 최고 속도는 7.31 ± 0.42 m/s",
  },
  {
    strike: "jab",
    measure: "velocity",
    value: [6.317, 7.162],
    unit: "m/s",
    population: "중국 남자 복서 16명, 앞손 스트레이트 최고 속도 (주니어 6.317 / 엘리트 7.162)",
    sourceIds: ["liu2022a"],
    confidence: "high",
    verifiedPrimary: true,
    note: "충격력 주니어 1035 N / 엘리트 1508 N",
  },
  {
    strike: "hook",
    measure: "velocity",
    value: [8.9, 11.2],
    unit: "m/s",
    population: "뒷손 훅 최대 속도, 주니어 복서 8명 8.9 / 엘리트 15명 11.2 (관성 센서 옷)",
    sourceIds: ["dinu2020"],
    confidence: "high",
    verifiedPrimary: true,
    note: "주니어 ±0.9, 엘리트 ±2.0 m/s. 같은 연구의 크로스는 8.1 m/s",
  },
  {
    strike: "hook",
    measure: "velocity",
    value: 11.95,
    unit: "m/s",
    population: "아마추어 남자 복서 15명, 앞손 훅 주먹 최고 속도 (3차원 동작 분석)",
    sourceIds: ["stanley2018"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±1.84 m/s (초록에서 확인)",
  },
  {
    strike: "hook",
    measure: "peakForce",
    value: 4405,
    unit: "N",
    population: "올림픽 복서 11명, 더미 머리",
    sourceIds: ["viano2005"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±2318 N, 손 속도 변화 11.0 ± 3.4 m/s (초록에서 확인)",
  },
  {
    strike: "uppercut",
    measure: "velocity",
    value: [7.3, 10.2],
    unit: "m/s",
    population: "뒷손 어퍼컷 최대 속도, 주니어 8명 7.3 / 엘리트 15명 10.2",
    sourceIds: ["dinu2020"],
    confidence: "high",
    verifiedPrimary: true,
    note: "주니어 ±1.0, 엘리트 ±1.8 m/s. 관성 센서로 추정한 힘은 엘리트 3242 ± 1767 N",
  },
  {
    strike: "lowKick",
    measure: "velocity",
    value: 12.46,
    unit: "m/s",
    population: "프로 무에타이 선수 7명(평균 60.6kg), 2차원 영상",
    sourceIds: ["praphanbundit2020"],
    confidence: "low",
    verifiedPrimary: true,
    note: "±1.40 m/s. 몸의 어느 점을 쟀는지 밝히지 않음. 팔을 뒤로 휘두른 경우 12.19 m/s",
  },
  {
    strike: "middleKick",
    measure: "velocity",
    value: 14.36,
    unit: "m/s",
    population: "위와 같은 연구",
    sourceIds: ["praphanbundit2020"],
    confidence: "low",
    verifiedPrimary: true,
    note: "±0.70 m/s. 같은 연구의 미들킥 힘 6321 N",
  },
  {
    strike: "highKick",
    measure: "velocity",
    value: 7.22,
    unit: "m/s",
    population: "무에타이 선수 8명, 머리 높이 돌려차기, 닿는 순간 발 속도",
    sourceIds: ["gavagan2017"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±1.47 m/s. 뻗는 중 최고 속도는 13.24 ± 2.30 m/s, 힘 1400 ± 419 N. praphanbundit2020의 하이킥은 10.89 m/s",
  },
  {
    strike: "frontKick",
    measure: "velocity",
    value: 7.7,
    unit: "m/s",
    population: "남자 군인 25명, 발목 표식의 닿기 10 ms 전 속도",
    sourceIds: ["vagner2019"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±1.03 m/s. 평균 충격력 2202 ± 489 N. 리뷰(corcoran2024) 범위 5.2~16.7 m/s",
  },
  {
    strike: "sideKick",
    measure: "velocity",
    value: [6.8, 9.5],
    unit: "m/s",
    population: "발 최고 속도, 초보 20명 6.8 / 숙련 20명 9.5 (120 Hz 영상)",
    sourceIds: ["hidayat2025"],
    confidence: "medium",
    verifiedPrimary: true,
    note: "초보 ±0.7, 숙련 ±0.8 m/s. 리뷰(corcoran2024) 범위 5.6~12.7 m/s",
  },
  {
    strike: "elbow",
    measure: "peakForce",
    value: [2440, 4490],
    unit: "N",
    population: "호신술 숙련자 91명, 무릎 꿇고 내려치는 팔꿈치 (여 31명 2440 / 남 60명 4490)",
    sourceIds: ["beranek2020"],
    confidence: "high",
    verifiedPrimary: true,
    note: "여 ±960, 남 ±2020 N. 팔꿈치 속도 자료는 찾지 못함",
  },
  {
    strike: "elbow",
    measure: "peakForce",
    value: 4677,
    unit: "N",
    population: "사관생도 16명, 힘 측정판",
    sourceIds: ["vagner2024"],
    confidence: "medium",
    verifiedPrimary: true,
    note: "±973 N. 논문 표에 오류가 있다고 확인됨",
  },
  {
    strike: "knee",
    measure: "velocity",
    value: [7.8, 11.0],
    unit: "m/s",
    population: "무에타이 클럽 선수, 훈련 전 7.8 → 훈련 뒤 11.0 (한 묶음 약 4명)",
    sourceIds: ["leemcgill2017"],
    confidence: "low",
    verifiedPrimary: true,
    note: "표준편차가 지나치게 작고 숫자가 서로 맞지 않는 곳이 있어 낮은 믿음. 같은 연구의 뒷무릎 충격력 8242 → 9482 N",
  },
];

/**
 * 타격 강도 지수 100점 기준 (PRD: 펀치·킥·팔꿈치·무릎별 공개 최고 충격력 기록 = 100).
 * 펀치·킥은 리뷰 논문의 인용으로만 확인했다. 원 논문을 확인하면 verifiedPrimary를 바꾼다.
 * 기록을 찾지 못한 기술은 null → 강도 지수 "자료 없음".
 */
export const MAX_FORCE_RECORD: Record<"punch" | "kick" | "elbow" | "knee", RefValue | null> = {
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
  elbow: {
    value: 10800,
    unit: "N",
    sourceIds: ["beranek2020"],
    confidence: "medium",
    verifiedPrimary: true,
    note: "남성 팔꿈치 299회 중 최댓값 (표 2, 10.80 kN). 같은 논문 본문은 극단값을 포함하면 13,188.2 N이라고 해 표와 맞지 않는다",
  },
  // 무릎: 공개 최고 기록을 찾지 못함. leemcgill2017의 묶음 평균 9482 N은 기록이 아니고 믿음이 낮아 쓰지 않는다
  knee: null,
};

/** 타격 자료에서 찾지 못한 것 (PLAN 작업 4) */
export const STRIKE_DATA_GAPS: string[] = [
  "카프킥(종아리 차기)의 속도·충격력 — 연구를 찾지 못함",
  "팔꿈치 치기의 속도",
  "무릎 치기의 공개 최고 충격력 기록",
  "스트레이트 외 기술의 impulse 방식 유효 질량 (운동량 계산에 맞는 값)",
  "정강이로 차는 로우킥의 3차원 측정 속도",
];
