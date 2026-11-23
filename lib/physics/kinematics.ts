// Design Ref: §2.2 처리 ⑦·⑧ — 속도와 진행 방향 각도, 이상값 검사

import { length, scale, sub, type Vec2 } from "./vector";

/** 이 범위를 벗어난 속도는 잘못 인식한 것으로 보고 횟수와 결과에서 뺀다 (PRD 5번) */
export const SPEED_MIN_MS = 0.5;
export const SPEED_MAX_MS = 20;

/**
 * 두 장면 사이의 속도 벡터(m/s).
 * p0·p1은 화면 좌표, dtSec은 두 장면의 시간 차이, metersPerUnit은 화면 거리 환산값.
 */
export function velocity(p0: Vec2, p1: Vec2, dtSec: number, metersPerUnit: number): Vec2 {
  if (dtSec <= 0) throw new Error("시간 차이는 0보다 커야 합니다");
  return scale(sub(p1, p0), metersPerUnit / dtSec);
}

/** 속력(m/s) */
export function speed(v: Vec2): number {
  return length(v);
}

/**
 * 진행 방향 각도(°). 화면 오른쪽 = 0°, 위쪽 = 90°, 아래쪽 = −90°.
 * 화면 좌표는 y가 아래로 커지므로 부호를 뒤집어 계산한다.
 */
export function directionAngleDeg(v: Vec2): number {
  return (Math.atan2(-v.y, v.x) * 180) / Math.PI;
}

/** 속도가 믿을 만한 범위(0.5~20 m/s)인지 */
export function isPlausibleSpeed(speedMs: number): boolean {
  return speedMs >= SPEED_MIN_MS && speedMs <= SPEED_MAX_MS;
}
