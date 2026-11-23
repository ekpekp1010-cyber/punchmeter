// PLAN 작업 24 · 성공 기준 "재계산 1초 이내": 최대 연타(10개) 계산과 22곳 누적이 1초 안에 끝나는지
import { describe, expect, it } from "vitest";
import { TECHNIQUES } from "../reference";
import type { Fighter, StrikeStep } from "../types";
import { accumulateLoads } from "./accumulate";
import { buildStrikeResult } from "./result";

const A: Fighter = { id: "A", sex: "male", weighInKg: 70, heightCm: 175, gloveOz: 10 };
const B: Fighter = { id: "B", sex: "female", weighInKg: 60, heightCm: 165, gloveOz: 10 };

describe("재계산 시간", () => {
  it("기술 12가지 × 10번 계산과 누적이 1초 안에 끝난다", () => {
    const steps: StrikeStep[] = TECHNIQUES.map((t) => ({
      attacker: "A",
      technique: t.id,
      side: "rear",
      target: t.targets.find((p) => !p.endsWith("Right") && p !== "liver") ?? t.targets[0],
      speedMps: t.speed?.defaultMps ?? 6,
      speedBasis: t.speed ? "research" : "userInput",
      defense: "none",
    }));
    const start = performance.now();
    for (let k = 0; k < 10; k++) {
      const results = steps.map((s) => buildStrikeResult(s, A, B, 0));
      accumulateLoads(
        results.map((r) => ({ defender: "B", hitPart: r.hitPart, forceN: r.force.regain.value ?? 0 })),
        B,
      );
    }
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
