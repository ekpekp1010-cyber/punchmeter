// Design Ref: §2.2 처리 ⑧ — 유효 질량은 "영상 분절 운동량 방식"으로 구하고, 방법 B 연구값으로 검산한다
// PLAN 작업 2 (보완): 몸의 조각(분절)마다 체중 대비 무게와 무게중심 위치.
//
// 출처: de Leva P (1996). Adjustments to Zatsiorsky-Seluyanov's segment inertia parameters.
//       J Biomech 29(9):1223–1230, Table 4 (원문 표를 직접 확인).
// 측정 대상: 대학 나이의 운동하는 젊은 성인 (여성 15명 평균 61.9kg, 남성 100명 평균 73.0kg).
//
// 사용법 (PLAN 작업 3에서 구현):
//   분절 무게 = 체중 × massPct / 100
//   분절 무게중심 = 시작 관절 + (끝 관절 − 시작 관절) × comPct / 100
//   유효 질량 = Σ(분절 무게 × 분절 무게중심의 타격 방향 속도) ÷ 주먹(발) 속도

export type Segment =
  | "head"
  | "trunk"
  | "upperArm"
  | "forearm"
  | "hand"
  | "thigh"
  | "shank"
  | "foot";

export interface SegmentParam {
  segment: Segment;
  /** 시작점 (무게중심 위치를 재는 기준) */
  origin: string;
  /** 끝점 */
  end: string;
  /** 체중 대비 분절 무게 (%) */
  massPct: { female: number; male: number };
  /** 시작점에서 무게중심까지의 거리, 분절 길이 대비 (%) */
  comPct: { female: number; male: number };
  /** 평균 분절 길이 (mm). 키에 대한 비율로 바꿔 뼈 길이를 추정할 때 쓴다 */
  lengthMm: { female: number; male: number };
}

/**
 * de Leva 1996 Table 4 제목의 평균 키 (mm).
 * 원문에는 여성 키가 "173.5 m"로 인쇄되어 있으나 단위 오타로 보고 1735mm로 쓴다.
 */
export const REFERENCE_STATURE_MM = { female: 1735, male: 1741 };

/** de Leva 1996 Table 4, 첫 부분 (관절 중심 기준의 쓰기 쉬운 끝점) */
export const SEGMENT_PARAMS: SegmentParam[] = [
  {
    segment: "head",
    origin: "정수리(VERT)",
    end: "양쪽 아래턱 모서리의 가운데(MIDG)",
    massPct: { female: 6.68, male: 6.94 },
    comPct: { female: 58.94, male: 59.76 },
    lengthMm: { female: 200.2, male: 203.3 },
  },
  {
    segment: "trunk",
    origin: "목아래 패인 곳(SUPR)",
    end: "양쪽 엉덩관절 가운데(MIDH)",
    massPct: { female: 42.57, male: 43.46 },
    comPct: { female: 41.51, male: 44.86 },
    lengthMm: { female: 529.3, male: 531.9 },
  },
  {
    segment: "upperArm",
    origin: "어깨관절(SJC)",
    end: "팔꿈치관절(EJC)",
    massPct: { female: 2.55, male: 2.71 },
    comPct: { female: 57.54, male: 57.72 },
    lengthMm: { female: 275.1, male: 281.7 },
  },
  {
    segment: "forearm",
    origin: "팔꿈치관절(EJC)",
    end: "손목관절(WJC)",
    massPct: { female: 1.38, male: 1.62 },
    comPct: { female: 45.59, male: 45.74 },
    lengthMm: { female: 264.3, male: 268.9 },
  },
  {
    segment: "hand",
    origin: "손목관절(WJC)",
    end: "셋째 손허리뼈 끝(MET3)",
    massPct: { female: 0.56, male: 0.61 },
    comPct: { female: 74.74, male: 79.0 },
    lengthMm: { female: 78.0, male: 86.2 },
  },
  {
    segment: "thigh",
    origin: "엉덩관절(HJC)",
    end: "무릎관절(KJC)",
    massPct: { female: 14.78, male: 14.16 },
    comPct: { female: 36.12, male: 40.95 },
    lengthMm: { female: 368.5, male: 422.2 },
  },
  {
    segment: "shank",
    origin: "무릎관절(KJC)",
    end: "바깥 복사뼈(LMAL)",
    massPct: { female: 4.81, male: 4.33 },
    comPct: { female: 44.16, male: 44.59 },
    lengthMm: { female: 432.3, male: 434.0 },
  },
  {
    segment: "foot",
    origin: "발뒤꿈치(HEEL)",
    end: "가장 긴 발가락 끝(TTIP)",
    massPct: { female: 1.29, male: 1.37 },
    comPct: { female: 40.14, male: 44.15 },
    lengthMm: { female: 228.3, male: 258.1 },
  },
];

export const SEGMENT_SOURCE_IDS = ["deleva1996"];

/**
 * 방법 B(최대 충격력 ÷ 가속도) 연구값의 체중 대비 유효 질량 범위.
 * 영상 분절 계산값이 이 범위에서 크게 벗어나면 "범위를 벗어난 추정값"으로 표시하는 검산용이다.
 * 값의 출처는 strikes.ts의 EFFECTIVE_MASS(method: "forceAccel") 참고.
 */
export const METHOD_B_CHECK_RANGE_PCT: Partial<
  Record<"jab" | "cross" | "roundhouseKick" | "sideKick" | "frontKick", [number, number]>
> = {
  jab: [21.51, 21.51],
  cross: [21.04, 21.04],
  roundhouseKick: [18, 20.12],
  sideKick: [73.09, 85],
  frontKick: [44, 44],
};
