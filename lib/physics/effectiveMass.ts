// Design Ref: §2.2 처리 ⑧ — 유효 질량: 영상 분절 운동량 방식 + 방법 B 연구값 검산
// 유효 질량 = Σ(분절 무게 × 분절 무게중심의 타격 방향 속도) ÷ 주먹(발) 속도

import { METHOD_B_CHECK_RANGE_PCT, OZ_TO_KG } from "../reference";
import type { GloveOz } from "../types";
import { dot, length, unit, type Vec2 } from "./vector";

/** 맞기 직전 분절 하나의 무게와 무게중심 속도 */
export interface SegmentMotion {
  massKg: number;
  /** 분절 무게중심의 속도(m/s) */
  velocity: Vec2;
}

/**
 * 타격 한 번의 유효 질량(kg).
 * tipVelocity는 주먹(발) 끝의 속도. 끝이 움직이지 않으면 계산할 수 없어 null.
 * 타격 방향과 반대로 움직이는 분절은 음수로 더해진다 (몸을 빼면서 치면 작아짐).
 */
export function effectiveMassKg(segments: SegmentMotion[], tipVelocity: Vec2): number | null {
  const direction = unit(tipVelocity);
  if (!direction) return null;
  const tipSpeed = length(tipVelocity);
  const momentumAlongStrike = segments.reduce(
    (sum, s) => sum + s.massKg * dot(s.velocity, direction),
    0,
  );
  return momentumAlongStrike / tipSpeed;
}

/** 글러브 한 짝의 무게(kg). 펀치의 유효 질량에 더한다 */
export function gloveMassKg(gloveOz: GloveOz): number {
  return gloveOz * OZ_TO_KG;
}

/**
 * 검산 허용 폭 (잠정값).
 * 방법 B(최대 충격력 ÷ 가속도)는 맞는 순간 팔을 굳히는 효과까지 담겨 영상 분절 계산보다 크게 나온다.
 * 그래서 아래쪽은 넓게(연구 최솟값의 1/10까지), 위쪽은 최댓값의 2배까지 허용한다.
 * PLAN 작업 23(정확도 검증)에서 실제 영상으로 다시 맞춘다.
 */
export const METHOD_B_LOWER_FACTOR = 0.1;
export const METHOD_B_UPPER_FACTOR = 2;

export type MethodBStrike = keyof typeof METHOD_B_CHECK_RANGE_PCT;

export interface MethodBCheck {
  /** 계산한 유효 질량의 체중 대비 % */
  ratioPct: number;
  /** 연구값 범위 (체중 대비 %) */
  rangePct: [number, number];
  /** true면 "범위를 벗어난 추정값"으로 표시 */
  outOfRange: boolean;
}

/** 방법 B 연구값으로 검산. 그 타격의 연구값이 없으면 null */
export function checkAgainstMethodB(
  effectiveMass: number,
  bodyMassKg: number,
  strike: MethodBStrike,
): MethodBCheck | null {
  const range = METHOD_B_CHECK_RANGE_PCT[strike];
  if (!range) return null;
  const ratioPct = (effectiveMass / bodyMassKg) * 100;
  const outOfRange =
    ratioPct < range[0] * METHOD_B_LOWER_FACTOR || ratioPct > range[1] * METHOD_B_UPPER_FACTOR;
  return { ratioPct, rangePct: range, outOfRange };
}
