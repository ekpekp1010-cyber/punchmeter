// Design Ref: §4.4 3D 캐릭터 준비 — 키는 크기 배율, 체중은 모양 변형(morph) 섞기, 리치는 팔 길이 (PLAN 작업 9)
// 이 값들은 3D 모양에만 쓰고, 힘·에너지 계산에는 쓰지 않는다 (계산은 lib/lab).
//
// 체중 → 모양 변형:
//   캐릭터 몸 부피(L)를 Blender에서 재 두었다 (public/models/models.json의 volumeL).
//   입력 체중을 부피로 바꿀 때 "사람 몸 밀도 ≈ 물(1 kg/L)"이라는 그림용 가정을 쓴다.
//   키에 맞춰 크기를 s배 하면 부피는 s³배가 되므로, 목표 부피 = 체중 ÷ 밀도 ÷ s³ (기본 크기 기준).
//   부피가 변형 양에 비례한다고 보고(선형), 무거움(heavy) 또는 마름(light) 변형의 양을 푼다.
// MPFB의 "가장 무거움"도 기본보다 부피가 약 9~14% 크기에 그쳐, 무거운 선수는 변형을 1배보다 세게 쓴다
// (최대 HEAVY_MAX배). 그래도 모자라면 가장 가까운 모양으로 두고 clamped = true로 알린다.

import type { BodyPart, Fighter, Sex } from "../types";

/** models.json에 적힌 캐릭터 치수 (scripts/blender/make_fighters.py가 만듦) */
export interface ModelInfo {
  file: string;
  /** 기본 캐릭터 키(m) */
  heightM: number;
  /** 양팔을 벌린 길이(m) */
  armSpanM: number;
  /** 한쪽 팔 길이(m, 어깨~가운뎃손가락 끝) */
  armLengthM: number;
  /** 체형별 몸 부피(L) */
  volumeL: { base: number; light: number; heavy: number; muscular: number };
  morphs: string[];
  /** 부위 22곳의 표면 위치와 치는 쪽 방향 (모델 기준, 기본 체형·쉬는 자세) */
  anchors: Record<BodyPart, { pos: [number, number, number]; from: [number, number, number] }>;
}

export type ModelsJson = Record<"fighter_male" | "fighter_female", ModelInfo>;

export const MODEL_KEY: Record<Sex, keyof ModelsJson> = { male: "fighter_male", female: "fighter_female" };

/** 그림용 가정: 사람 몸 밀도 ≈ 물 (kg/L). 3D 모양에만 쓴다 */
export const BODY_DENSITY_KG_PER_L = 1.0;
/** 선수 모양에 늘 섞는 근육형 변형의 양 (그림용) */
export const FIGHTER_MUSCLE = 0.5;
/** 무거움 변형을 최대 몇 배까지 쓸지 (더 세게 쓰면 모양이 일그러진다) */
export const HEAVY_MAX = 3;
/** 마름 변형을 최대 몇 배까지 쓸지 */
export const LIGHT_MAX = 1.5;
/** 리치로 팔 길이를 바꾸는 한계 (팔 뼈 크기 배율) */
export const ARM_SCALE_RANGE: [number, number] = [0.85, 1.15];

export interface BodyShape {
  /** 캐릭터 전체 크기 배율 (키 ÷ 기본 키) */
  scale: number;
  /** 모양 변형의 양 */
  morph: { light: number; heavy: number; muscular: number };
  /** 위팔 뼈 크기 배율 (리치가 없으면 1) */
  armScale: number;
  /** 체중 또는 리치가 변형 한계를 넘어 가장 가까운 모양으로 둔 경우 true */
  clamped: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 선수 정보에 맞는 3D 모양 */
export function bodyShape(f: Fighter, model: ModelInfo): BodyShape {
  const scale = f.heightCm / 100 / model.heightM;
  const v = model.volumeL;

  // 근육형을 섞은 뒤의 부피에서 출발해, 목표 부피까지 무거움(또는 마름) 변형으로 채운다
  const start = v.base + FIGHTER_MUSCLE * (v.muscular - v.base);
  const target = f.weighInKg / BODY_DENSITY_KG_PER_L / scale ** 3;
  let light = 0;
  let heavy = 0;
  let clamped = false;
  if (target >= start) {
    const need = (target - start) / (v.heavy - v.base);
    heavy = clamp(need, 0, HEAVY_MAX);
    clamped = need > HEAVY_MAX;
  } else {
    const need = (start - target) / (v.base - v.light);
    light = clamp(need, 0, LIGHT_MAX);
    clamped = need > LIGHT_MAX;
  }

  // 리치: 위팔 뼈를 k배 하면 팔 전체가 k배가 되어 양팔 길이가 2 × 팔 길이 × (k − 1)만큼 바뀐다
  let armScale = 1;
  if (f.reachCm !== undefined) {
    const span = model.armSpanM * scale;
    const arm = model.armLengthM * scale;
    const need = 1 + (f.reachCm / 100 - span) / (2 * arm);
    armScale = clamp(need, ARM_SCALE_RANGE[0], ARM_SCALE_RANGE[1]);
    clamped = clamped || need !== armScale;
  }

  return { scale, morph: { light, heavy, muscular: FIGHTER_MUSCLE }, armScale, clamped };
}
