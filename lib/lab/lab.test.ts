// Design Ref: §8.2 계산 테스트 6~9 — 맞은 부위, 의학적 판단, 22곳 누적과 색 단계, 관절기 판단
// 실행: npm test

import { describe, expect, it } from "vitest";
import { partThreshold } from "../physics";
import type { ComboItem, Fighter, MoveStep, StrikeStep } from "../types";
import { accumulateLoads, buildStrikeResult, isMoveStep, judgeJointLock, medicalJudgment, resolveHitPart, strikeIndexOf, strikesOf } from "./index";

const A: Fighter = { id: "A", sex: "male", weighInKg: 70, heightCm: 175, gloveOz: 10 };
const B: Fighter = { id: "B", sex: "female", weighInKg: 60, heightCm: 165, gloveOz: 10 };

const step = (over: Partial<StrikeStep> = {}): StrikeStep => ({
  attacker: "A",
  technique: "hook",
  side: "rear",
  target: "cheekLeft",
  speedMps: 11.2,
  speedBasis: "research",
  defense: "none",
  ...over,
});

describe("6. 맞은 부위", () => {
  it("맞음이면 노린 부위", () => {
    expect(resolveHitPart(step())).toEqual({ hitPart: "cheekLeft", outcome: "hit" });
  });

  it("팔로 막으면 노린 쪽 아래팔에 막힌다", () => {
    expect(resolveHitPart(step({ defense: "armBlock" }))).toEqual({ hitPart: "forearmLeft", outcome: "blocked" });
    expect(resolveHitPart(step({ target: "ribsRight", defense: "armBlock" })).hitPart).toBe("forearmRight");
  });

  it("가운데 부위는 뒷손이면 상대 왼쪽, 앞손이면 오른쪽 아래팔", () => {
    expect(resolveHitPart(step({ technique: "cross", target: "jaw", speedMps: 9.14, defense: "armBlock" })).hitPart).toBe("forearmLeft");
    expect(resolveHitPart(step({ technique: "jab", side: "lead", target: "nose", speedMps: 5.63, defense: "armBlock" })).hitPart).toBe("forearmRight");
  });

  it("로우킥·카프킥을 막으면 정강이", () => {
    expect(resolveHitPart(step({ technique: "lowKick", target: "thighLeft", speedMps: 12.46, defense: "armBlock" })).hitPart).toBe("shinLeft");
    expect(resolveHitPart(step({ technique: "calfKick", target: "calfRight", speedMps: 8, speedBasis: "userInput", defense: "armBlock" })).hitPart).toBe("shinRight");
  });
});

describe("의학적 판단", () => {
  it("한계 힘을 넘으면 '부상 위험 구간', 출처가 붙는다", () => {
    const limit = partThreshold("liver", "female", 165).forceN;
    const j = medicalJudgment("liver", limit * 1.2, B);
    expect(j.text).toContain("부상 위험 구간");
    expect(j.sourceIds).toContain("yoganandan2000");
    expect(j.estimated).toBe(false);
  });

  it("코는 뇌진탕 기준과 함께 코뼈 골절 힘 범위(450~850 N)를 덧붙인다", () => {
    const j = medicalJudgment("nose", 1300, B);
    expect(j.text).toContain("코뼈 골절 50% 위험 450~850 N보다 큰 힘");
    expect(j.sourceIds).toEqual(expect.arrayContaining(["king2003", "cormier2010"]));
    expect(j.estimated).toBe(true);
  });

  it("허벅지는 근육 타박 실험 값을 덧붙인다", () => {
    const j = medicalJudgment("thighLeft", 1000, B);
    expect(j.text).toContain("근육 타박");
    expect(j.sourceIds).toContain("barnes2022");
  });

  it("훅·킥으로 머리를 맞으면 회전 주의를 덧붙이고, 펀치(크로스)나 몸통에는 붙이지 않는다", () => {
    const hook = medicalJudgment("jaw", 2000, B, "hook");
    expect(hook.text).toContain("회전 주의: 훅");
    expect(hook.sourceIds).toContain("viano2005");
    expect(medicalJudgment("templeLeft", 3000, B, "highKick").text).toContain("회전 주의: 킥");
    expect(medicalJudgment("jaw", 2000, B, "cross").text).not.toContain("회전 주의");
    expect(medicalJudgment("liver", 2000, B, "hook").text).not.toContain("회전 주의");
  });

  it("타격 결과에 판단이 붙고, 막힌 타격은 막은 부위로 판단한다", () => {
    const r = buildStrikeResult(step({ defense: "armBlock" }), A, B, 0.4);
    expect(r.outcome).toBe("blocked");
    expect(r.medical.part).toBe("forearmLeft");
    expect(r.contactTimeSec).toBe(0.4);
  });
});

describe("7·8. 22곳 누적과 색 단계", () => {
  it("22곳을 모두 돌려주고, 맞지 않은 부위는 0과 0단계", () => {
    const loads = accumulateLoads([], B);
    expect(loads).toHaveLength(22);
    for (const l of loads) {
      expect(l.accumulatedForceN).toBe(0);
      expect(l.colorStep).toBe(0);
    }
  });

  it("같은 부위에 두 번 맞으면 더하고, 다른 선수가 맞은 타격은 빼고 센다", () => {
    const limit = partThreshold("liver", "female", 165).forceN;
    const loads = accumulateLoads(
      [
        { defender: "B", hitPart: "liver", forceN: limit * 0.3 },
        { defender: "B", hitPart: "liver", forceN: limit * 0.3 },
        { defender: "A", hitPart: "liver", forceN: limit * 5 },
      ],
      B,
    );
    const liver = loads.find((l) => l.part === "liver")!;
    expect(liver.ratioPct).toBeCloseTo(60, 6);
    expect(liver.colorStep).toBe(3);
  });

  it("색 단계 경계: 1%→1, 25%→2, 50%→3, 75%→4, 100%→5", () => {
    const limit = partThreshold("thighRight", "female", 165).forceN;
    const stepAt = (pct: number) =>
      accumulateLoads([{ defender: "B", hitPart: "thighRight", forceN: (limit * pct) / 100 }], B).find(
        (l) => l.part === "thighRight",
      )!.colorStep;
    expect([stepAt(1), stepAt(25), stepAt(50), stepAt(75), stepAt(100)]).toEqual([1, 2, 3, 4, 5]);
  });

  it("한계 힘에 근거가 붙는다 (허벅지는 연구값, 명치는 추정)", () => {
    const loads = accumulateLoads([], A);
    expect(loads.find((l) => l.part === "thighLeft")!.thresholdN.basis).toBe("research");
    expect(loads.find((l) => l.part === "solarPlexus")!.thresholdN.basis).toBe("estimated");
  });
});

describe("9. 관절기 판단", () => {
  it("힐훅 70°: 정상 범위 끝(20°)보다 50° 더, 부상 기준 58°를 넘어 부상 위험", () => {
    const j = judgeJointLock("A", "heelHook", 70, B);
    expect(j.overNormalDeg).toBe(50);
    expect(j.overInjury).toBe(true);
    expect(j.text).toContain("부상 위험 구간");
    expect(j.sourceIds).toEqual(expect.arrayContaining(["lorenz2015", "meyer2008"]));
  });

  it("암바: 부상 각도 자료가 없어 부상 판단을 하지 않는다 (여성 정상 끝 4.7°)", () => {
    const j = judgeJointLock("A", "armbar", 20, B);
    expect(j.overNormalDeg).toBeCloseTo(15.3, 9);
    expect(j.overInjury).toBeNull();
    expect(j.trial.injuryDeg.basis).toBe("noData");
    expect(j.text).toContain("판단하지 않음");
  });

  it("정상 범위 안이면 '정상 범위 안'", () => {
    const j = judgeJointLock("B", "ankleLock", 40, A);
    expect(j.overNormalDeg).toBeLessThan(0);
    expect(j.text).toContain("정상 범위(54.6°) 안");
  });
});

describe("연타 목록 (빽스텝 섞기)", () => {
  const jab: StrikeStep = { attacker: "A", technique: "jab", side: "lead", target: "jaw", speedMps: 6, speedBasis: "research", defense: "none" };
  const back: MoveStep = { kind: "move", fighter: "A", move: "backStep" };
  const items: ComboItem[] = [jab, back, { ...jab, technique: "cross", side: "rear" }];

  it("움직임은 결과 계산에서 빠지고, 타격 순서는 타격만 세어 정한다", () => {
    expect(isMoveStep(back)).toBe(true);
    expect(isMoveStep(jab)).toBe(false);
    expect(strikesOf(items).map((s) => s.technique)).toEqual(["jab", "cross"]);
    expect(strikeIndexOf(items, 0)).toBe(0);
    expect(strikeIndexOf(items, 1)).toBe(-1);
    expect(strikeIndexOf(items, 2)).toBe(1);
  });
});
