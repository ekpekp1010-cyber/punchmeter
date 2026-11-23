// Design Ref: §3 참고값 자료 파일 — 글러브 무게와 충격 흡수
// PLAN 작업 2. PRD: 펀치 충격력에 글러브 무게별 충격 흡수율을 적용하고,
// 유효 질량에 글러브 무게를 더한다. 자료가 없는 무게는 가까운 두 무게 사이로 추정한다.
//
// 조사 결과 요약 (계산 방법을 정할 때 꼭 볼 것):
//   - 같은 장비로 무게를 바꿔 잰 연구는 10·12·14·16oz뿐이다 (nakano2009).
//     네 무게 사이의 차이는 통계적으로 의미가 없었고, 저자는 "무게보다 쿠션이 중요하다"고 했다.
//   - 맨손과 8oz는 측정 자료가 없다.
//   - 4oz MMA 글러브는 복싱 글러브보다 최대 충격력이 4~5배 컸다 (leemcgill2014, 복싱 글러브 무게는 밝히지 않음).

import type { GloveOz } from "../types";
import type { RefValue } from "./sources";

/** 1oz를 kg으로 바꾸는 값 (1oz = 28.35g) */
export const OZ_TO_KG = 0.02835;

export interface GloveForceEntry extends RefValue {
  gloveOz: GloveOz;
}

/** 같은 실험에서 글러브 무게만 바꿔 잰 뒷손 스트레이트 최대 충격력 (엘리트 대학 복서 9명) */
export const GLOVE_PEAK_FORCE: GloveForceEntry[] = [
  {
    gloveOz: 10,
    value: 2090,
    unit: "N",
    sourceIds: ["nakano2009"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±460 N",
  },
  {
    gloveOz: 12,
    value: 2140,
    unit: "N",
    sourceIds: ["nakano2009"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±540 N",
  },
  {
    gloveOz: 14,
    value: 1920,
    unit: "N",
    sourceIds: ["nakano2009"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±330 N",
  },
  {
    gloveOz: 16,
    value: 1900,
    unit: "N",
    sourceIds: ["nakano2009"],
    confidence: "high",
    verifiedPrimary: true,
    note: "±420 N",
  },
];

/** MMA 글러브(4oz)와 복싱 글러브의 비교 */
export const MMA_VS_BOXING_GLOVE: RefValue = {
  value: [4, 5],
  unit: "배 (MMA 최대 충격력 ÷ 복싱 글러브 최대 충격력)",
  sourceIds: ["leemcgill2014"],
  confidence: "high",
  verifiedPrimary: true,
  note: "주먹 모형으로 금속판을 친 실험. 복싱 글러브 무게는 밝히지 않음. 1만 번 친 뒤 MMA 글러브의 최대 충격력은 35% 더 커짐",
};

/** 측정 자료가 없는 글러브 무게 */
export const GLOVE_OZ_WITHOUT_DATA: GloveOz[] = [0, 8];
