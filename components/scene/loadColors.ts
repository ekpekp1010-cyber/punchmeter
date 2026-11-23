// Design Ref: §5.4 "22곳 누적 충격 색 5단계, 부상 위험 구간, 자료 없음" (PLAN 작업 18)
// 색 단계는 lib/physics/thresholds.ts colorStep이 정한다 (1~24% / 25~49% / 50~74% / 75~99% / 100% 이상).
// 3D에서는 이 색을 피부·옷 색에 곱해 칠한다. 범례도 같은 색을 쓴다.

import type { ColorStep } from "@/lib/types";

export const STEP_COLORS: Record<Exclude<ColorStep, null>, string> = {
  0: "#ffffff",
  1: "#fff08a",
  2: "#ffc061",
  3: "#ff8a3d",
  4: "#ff4433",
  5: "#a3166b",
};

/** 한계 힘 자료가 없는 부위 */
export const NO_DATA_COLOR = "#8c8c8c";

export const STEP_LABELS: Record<Exclude<ColorStep, null | 0>, string> = {
  1: "1~24%",
  2: "25~49%",
  3: "50~74%",
  4: "75~99%",
  5: "100% 이상 · 부상 위험 구간",
};

export function colorOfStep(step: ColorStep): string | null {
  if (step === null) return NO_DATA_COLOR;
  return step === 0 ? null : STEP_COLORS[step];
}
