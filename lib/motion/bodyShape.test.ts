// PLAN 작업 9: 키·체중·리치에 맞는 3D 모양 값이 규칙대로 나오는지 확인한다
import { describe, expect, it } from "vitest";
import models from "../../public/models/models.json";
import type { Fighter } from "../types";
import { BODY_DENSITY_KG_PER_L, FIGHTER_MUSCLE, HEAVY_MAX, bodyShape, type ModelInfo } from "./bodyShape";

const male = models.fighter_male as ModelInfo;
const v = male.volumeL;
const fighter = (over: Partial<Fighter> = {}): Fighter => ({
  id: "A",
  sex: "male",
  weighInKg: 60,
  heightCm: male.heightM * 100,
  gloveOz: 10,
  ...over,
});

/** 그 모양의 부피(L) — 변형 양에 비례한다고 본 값 */
function volumeOf(f: Fighter) {
  const s = bodyShape(f, male);
  const local =
    v.base + s.morph.muscular * (v.muscular - v.base) + s.morph.heavy * (v.heavy - v.base) + s.morph.light * (v.light - v.base);
  return local * s.scale ** 3;
}

describe("3D 모양 맞추기", () => {
  it("키 배율 = 입력 키 ÷ 기본 키", () => {
    expect(bodyShape(fighter({ heightCm: 190 }), male).scale).toBeCloseTo(1.9 / male.heightM, 9);
  });

  it("모양 부피 × 밀도 = 입력 체중 (변형 한계 안일 때)", () => {
    for (const kg of [55, 62, 70]) {
      const f = fighter({ weighInKg: kg });
      expect(bodyShape(f, male).clamped).toBe(false);
      expect(volumeOf(f) * BODY_DENSITY_KG_PER_L).toBeCloseTo(kg, 6);
    }
  });

  it("체중이 늘면 무거움 변형이 늘고, 줄면 마름 변형을 쓴다 (근육형은 늘 섞음)", () => {
    const heavy = bodyShape(fighter({ weighInKg: 70 }), male).morph;
    const light = bodyShape(fighter({ weighInKg: 52 }), male).morph;
    expect(heavy.heavy).toBeGreaterThan(0);
    expect(heavy.light).toBe(0);
    expect(light.light).toBeGreaterThan(0);
    expect(light.heavy).toBe(0);
    expect(heavy.muscular).toBe(FIGHTER_MUSCLE);
  });

  it("아주 무거운 선수는 변형 한계(3배)에서 멈추고 clamped로 알린다", () => {
    const s = bodyShape(fighter({ weighInKg: 150 }), male);
    expect(s.morph.heavy).toBe(HEAVY_MAX);
    expect(s.clamped).toBe(true);
  });

  it("리치가 없으면 팔 배율 1, 기본 캐릭터의 팔 벌린 길이와 같으면 1", () => {
    expect(bodyShape(fighter(), male).armScale).toBe(1);
    expect(bodyShape(fighter({ reachCm: male.armSpanM * 100 }), male).armScale).toBeCloseTo(1, 9);
  });

  it("리치가 길면 팔 배율이 1보다 크고, 한계(1.15)를 넘지 않는다", () => {
    const s = bodyShape(fighter({ reachCm: male.armSpanM * 100 + 10 }), male);
    expect(s.armScale).toBeCloseTo(1 + 0.1 / (2 * male.armLengthM), 9);
    expect(bodyShape(fighter({ reachCm: 260 }), male).armScale).toBe(1.15);
  });
});
