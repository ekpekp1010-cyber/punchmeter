// PLAN 작업 22: 연구 재현 검증. 결과표를 출력하고, 기준 사례(Walilko)는 반드시 ±15% 안이어야 한다.
// 다른 사례는 결과를 기록만 한다 (계산식을 결과에 맞춰 고치지 않기 위해).
import { describe, expect, it } from "vitest";
import { REPRODUCTION_CASES, reproduce } from "./validation";

describe("연구 재현 검증", () => {
  const results = REPRODUCTION_CASES.map(reproduce);

  it("결과표 (npm test 출력에 보임)", () => {
    const rows = results.map(
      (r) =>
        `${r.within15 ? "✔" : "✘"} ${r.case.label}: 앱 ${Math.round(r.appForceN)} N / 연구 ${Math.round(r.case.measuredForceN)} N (${r.errorPct >= 0 ? "+" : ""}${r.errorPct.toFixed(1)}%)`,
    );
    console.log(["[연구 재현]", ...rows, `±15% 안: ${results.filter((r) => r.within15).length}/${results.length}`].join("\n"));
    expect(results).toHaveLength(REPRODUCTION_CASES.length);
  });

  it("기준 사례 Walilko 2005 스트레이트는 ±15% 안", () => {
    expect(results.find((r) => r.case.id === "walilko-cross")?.within15).toBe(true);
  });
});
