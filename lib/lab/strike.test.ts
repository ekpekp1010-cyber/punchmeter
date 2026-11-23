// Design Ref: §8.2 계산 테스트 1~5 — 타격 계산이 연구를 재현하고, 근거·범위를 올바르게 붙이는지 확인한다
// 실행: npm test

import { describe, expect, it } from "vitest";
import type { Fighter, StrikeStep } from "../types";
import { computeStrike, StrikeInputError } from "./strike";

const fighter = (over: Partial<Fighter> = {}): Fighter => ({
  id: "A",
  sex: "male",
  weighInKg: 70,
  heightCm: 175,
  gloveOz: 10,
  ...over,
});

const step = (over: Partial<StrikeStep> = {}): StrikeStep => ({
  attacker: "A",
  technique: "cross",
  side: "rear",
  target: "jaw",
  speedMps: 9.14,
  speedBasis: "research",
  defense: "none",
  ...over,
});

describe("1. 연구 재현 (Walilko 2005)", () => {
  it("크로스 9.14 m/s, 유효 질량 2.9kg(+10oz 글러브) → 충격력이 3427N의 ±15% 안", () => {
    const r = computeStrike(step(), fighter());
    const f = r.force.weighIn.value as number;
    expect(Math.abs(f - 3427) / 3427).toBeLessThan(0.15);
  });

  it("맨손이면 글러브 무게가 없어 정확히 3427N", () => {
    const r = computeStrike(step(), fighter({ gloveOz: 0 }));
    expect(r.force.weighIn.value).toBeCloseTo(3427, 6);
  });
});

describe("2. 계체량·리게인", () => {
  it("분절로 어림하는 기술(훅)은 리게인 운동량이 계체량의 1.075배", () => {
    const r = computeStrike(step({ technique: "hook", speedMps: 11.2 }), fighter({ gloveOz: 0 }));
    const w = r.momentum.weighIn.value as number;
    const g = r.momentum.regain.value as number;
    expect(g / w).toBeCloseTo(1.075, 9);
  });

  it("크로스는 연구 유효 질량이 체중과 무관해 계체량·리게인 값이 같고, 리게인은 '추정' 표시", () => {
    const r = computeStrike(step(), fighter());
    expect(r.momentum.regain.value).toBeCloseTo(r.momentum.weighIn.value as number, 9);
    expect(r.momentum.weighIn.basis).toBe("research");
    expect(r.momentum.regain.basis).toBe("estimated");
  });

  it("계체량 39kg·키 139cm는 계산하지 않는다", () => {
    expect(() => computeStrike(step(), fighter({ weighInKg: 39 }))).toThrow(StrikeInputError);
    expect(() => computeStrike(step(), fighter({ heightCm: 139 }))).toThrow(StrikeInputError);
  });
});

describe("3. 글러브", () => {
  it("16oz 크로스는 10oz보다 충격력이 측정 비율(1900/2090)과 무게 차이만큼 다르다", () => {
    const f10 = computeStrike(step(), fighter({ gloveOz: 10 })).force.weighIn.value as number;
    const f16 = computeStrike(step(), fighter({ gloveOz: 16 })).force.weighIn.value as number;
    const massRatio = (2.9 + 16 * 0.02835) / (2.9 + 10 * 0.02835);
    expect(f16 / f10).toBeCloseTo((1900 / 2090) * massRatio, 9);
  });

  it("킥·팔꿈치·무릎은 글러브를 끼어도 유효 질량·충격력이 바뀌지 않는다", () => {
    for (const technique of ["middleKick", "knee"] as const) {
      const s = step({ technique, speedMps: technique === "knee" ? 11 : 14.36 });
      const bare = computeStrike(s, fighter({ gloveOz: 0 }));
      const gloved = computeStrike(s, fighter({ gloveOz: 16 }));
      expect(gloved.force.weighIn.value).toBeCloseTo(bare.force.weighIn.value as number, 9);
      expect(gloved.glove.basis).toBe("notApplicable");
    }
  });
});

describe("4. 강도 지수", () => {
  it("100을 넘지 않는다 (무거운 선수의 빠른 미들킥도 100에서 자름)", () => {
    const r = computeStrike(step({ technique: "middleKick", speedMps: 14.66 }), fighter({ weighInKg: 150, heightCm: 200 }));
    expect(r.intensityIndex.weighIn.value).toBeLessThanOrEqual(100);
  });

  it("무릎은 최고 기록이 없어 '자료 없음'", () => {
    const r = computeStrike(step({ technique: "knee", speedMps: 11 }), fighter());
    expect(r.intensityIndex.weighIn).toMatchObject({ value: null, basis: "noData" });
    expect(r.intensityIndex.regain.basis).toBe("noData");
  });
});

describe("5. 속도 자료 없는 기술", () => {
  it("팔꿈치를 연구 속도로 계산하려 하면 직접 넣으라고 알려 준다", () => {
    expect(() => computeStrike(step({ technique: "elbow", speedMps: 5 }), fighter())).toThrow(/직접 넣어/);
  });

  it("직접 넣은 속도는 '사용자 입력값'으로 계산된다", () => {
    const r = computeStrike(step({ technique: "elbow", speedMps: 5, speedBasis: "userInput" }), fighter());
    expect(r.speed).toMatchObject({ value: 5, basis: "userInput" });
    expect(r.force.weighIn.value).toBeGreaterThan(0);
  });

  it("연구 범위 밖의 속도는 받지 않는다 (잽 범위 5.05~6.21)", () => {
    expect(() => computeStrike(step({ technique: "jab", speedMps: 9 }), fighter())).toThrow(/연구 범위/);
  });
});

describe("근거와 범위", () => {
  it("분절 어림은 '추정'이고 출처는 de Leva 분절표, 값 ≤ 범위 위 끝", () => {
    const r = computeStrike(step({ technique: "hook", speedMps: 11.2 }), fighter());
    const m = r.effectiveMass.weighIn;
    expect(m.basis).toBe("estimated");
    expect(m.sourceIds).toEqual(["deleva1996"]);
    expect(m.value as number).toBeLessThanOrEqual(m.high as number);
  });

  it("어림한 충격력이 공개 측정값과 같은 크기 (70kg 남성, 기본 속도)", () => {
    const f = (technique: StrikeStep["technique"], speedMps: number, gloveOz: Fighter["gloveOz"] = 10) =>
      computeStrike(step({ technique, speedMps }), fighter({ gloveOz })).force.weighIn.value as number;
    // 잽: 측정 1035~1508 N (liu2022a) / 훅: 2122~4405 N (kacprzak2025·viano2005) / 미들킥: 6321~7420 N
    expect(f("jab", 5.63)).toBeGreaterThan(1000);
    expect(f("jab", 5.63)).toBeLessThan(1600);
    expect(f("hook", 11.2)).toBeGreaterThan(2100);
    expect(f("hook", 11.2)).toBeLessThan(4500);
    expect(f("middleKick", 14.36, 0)).toBeGreaterThan(6000);
    expect(f("middleKick", 14.36, 0)).toBeLessThan(9015);
  });

  it("충격력은 항상 '추정'이고 충격 시간 출처(walilko2005)가 붙는다", () => {
    const r = computeStrike(step({ technique: "hook", speedMps: 11.2 }), fighter());
    expect(r.force.weighIn.basis).toBe("estimated");
    expect(r.force.weighIn.sourceIds).toContain("walilko2005");
  });

  it("운동에너지 = ½ × 유효 질량 × 속도²", () => {
    const r = computeStrike(step(), fighter({ gloveOz: 0 }));
    expect(r.energy.weighIn.value).toBeCloseTo(0.5 * 2.9 * 9.14 ** 2, 9);
  });
});
