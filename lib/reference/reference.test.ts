// PLAN 작업 5: 기술·부위 목록이 서로 맞고, 숫자가 모두 연구값·출처와 이어져 있는지 확인한다
// 실행: npm test

import { describe, expect, it } from "vitest";
import {
  BODY_PARTS,
  MUSCLE_DENSITY,
  PART_THRESHOLD_PLAN,
  SOURCES,
  STRIKE_BENCHMARKS,
  TECHNIQUES,
  canTarget,
  sideCanTarget,
  techniqueInfo,
} from "./index";

describe("부위 22곳", () => {
  it("22곳이고 이름이 겹치지 않는다", () => {
    const ids = BODY_PARTS.map((p) => p.id);
    expect(ids).toHaveLength(22);
    expect(new Set(ids).size).toBe(22);
  });

  it("머리 7·몸통 5·팔 4·다리 6", () => {
    const count = (region: string) => BODY_PARTS.filter((p) => p.region === region).length;
    expect([count("head"), count("torso"), count("arm"), count("leg")]).toEqual([7, 5, 4, 6]);
  });

  it("부위 목록과 한계 힘 표의 부위가 똑같다", () => {
    expect(BODY_PARTS.map((p) => p.id).sort()).toEqual(Object.keys(PART_THRESHOLD_PLAN).sort());
  });
});

describe("기술 12가지", () => {
  it("12가지이고 이름이 겹치지 않는다", () => {
    expect(TECHNIQUES).toHaveLength(12);
    expect(new Set(TECHNIQUES.map((t) => t.id)).size).toBe(12);
  });

  it("속도 기본값은 조절 범위 안에 있다", () => {
    for (const t of TECHNIQUES) {
      if (!t.speed) continue;
      const [lo, hi] = t.speed.rangeMps;
      expect(lo).toBeLessThanOrEqual(hi);
      expect(t.speed.defaultMps).toBeGreaterThanOrEqual(lo);
      expect(t.speed.defaultMps).toBeLessThanOrEqual(hi);
    }
  });

  it("속도 기본값은 지어낸 숫자가 아니라 같은 출처의 연구값(strikes.ts)과 일치한다", () => {
    for (const t of TECHNIQUES) {
      if (!t.speed) continue;
      const found = STRIKE_BENCHMARKS.some(
        (b) =>
          b.measure === "velocity" &&
          b.sourceIds.some((s) => t.speed!.sourceIds.includes(s)) &&
          (Array.isArray(b.value) ? b.value.includes(t.speed!.defaultMps) : b.value === t.speed!.defaultMps),
      );
      expect(found, `${t.id} 기본 속도 ${t.speed.defaultMps}`).toBe(true);
    }
  });

  it("평균 ± 표준편차 범위: 잽 5.63 ± 0.584 → 5.05~6.21, 앞차기 7.7 ± 1.03 → 6.67~8.73", () => {
    expect(techniqueInfo("jab").speed?.rangeMps).toEqual([5.05, 6.21]);
    expect(techniqueInfo("frontKick").speed?.rangeMps).toEqual([6.67, 8.73]);
  });

  it("카프킥·팔꿈치는 속도 자료가 없어 null (화면에서 직접 입력)", () => {
    expect(techniqueInfo("calfKick").speed).toBeNull();
    expect(techniqueInfo("elbow").speed).toBeNull();
  });

  it("유효 질량 연구값(impulse 방식)은 크로스만 있고, 나머지는 분절로 어림한다", () => {
    const research = TECHNIQUES.filter((t) => t.effectiveMass.basis === "research").map((t) => t.id);
    expect(research).toEqual(["cross"]);
  });

  it("모든 출처 번호가 출처 목록에 있다", () => {
    for (const t of TECHNIQUES) {
      const ids = [...(t.speed?.sourceIds ?? []), ...(t.effectiveMass.basis === "research" ? t.effectiveMass.sourceIds : [])];
      for (const id of ids) expect(SOURCES[id], `${t.id}: ${id}`).toBeDefined();
    }
  });

  it("노릴 부위: 로우킥은 허벅지만, 카프킥은 종아리만, 훅은 간을 노릴 수 있다", () => {
    expect(techniqueInfo("lowKick").targets).toEqual(["thighLeft", "thighRight"]);
    expect(techniqueInfo("calfKick").targets).toEqual(["calfLeft", "calfRight"]);
    expect(canTarget("hook", "liver")).toBe(true);
    expect(canTarget("jab", "calfLeft")).toBe(false);
  });

  it("훅·어퍼컷은 손이 들어오는 쪽만: 간(상대 오른쪽)은 앞손만, 상대 왼 관자놀이는 뒷손만, 턱은 둘 다", () => {
    expect(sideCanTarget("hook", "lead", "liver")).toBe(true);
    expect(sideCanTarget("hook", "rear", "liver")).toBe(false);
    expect(sideCanTarget("hook", "rear", "templeLeft")).toBe(true);
    expect(sideCanTarget("hook", "lead", "templeLeft")).toBe(false);
    expect(sideCanTarget("uppercut", "rear", "jaw")).toBe(true);
    expect(sideCanTarget("cross", "rear", "cheekRight")).toBe(true); // 직선 펀치는 제한 없음
  });

  it("막힘: 로우킥·카프킥은 정강이로, 나머지는 아래팔로 받는다", () => {
    const shin = TECHNIQUES.filter((t) => t.blockedBy === "shin").map((t) => t.id);
    expect(shin.sort()).toEqual(["calfKick", "lowKick"]);
  });
});

describe("근밀도", () => {
  it("모든 선수에 같은 연구값(1.0597 g/cm³)을 쓰고, 출처가 목록에 있다", () => {
    expect(MUSCLE_DENSITY.value).toBe(1.0597);
    expect(MUSCLE_DENSITY.unit).toBe("g/cm³");
    for (const id of MUSCLE_DENSITY.sourceIds) expect(SOURCES[id]).toBeDefined();
  });
});
