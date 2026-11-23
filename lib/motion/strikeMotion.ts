// Design Ref: §4.5 — 기술마다 단계(준비 → 뻗음 → 닿음 → 회수)를 정하고, 끝점 경로와 속도 곡선을 만든다 (PLAN 작업 11)
// 이 파일은 three.js 수학만 쓴다 (화면 없이 자동 테스트). 뼈를 돌리는 일은 components/scene에서 한다.
//
// 시간 값(준비·닿음 유지·회수)은 보기 좋게 정한 그림용 값이고, 뻗는 시간만 속도로 정해진다.
// 몸통 회전 각도도 그림용 값이다. 끝점 속도는 몸통 회전과 상관없이 경로·속도 곡선으로 정해진다
// (IK가 끝점을 경로 위에 그대로 놓기 때문).

import { Vector3 } from "three";
import type { TechniqueId } from "../types";
import { bezierPath, extendDistance, extendDuration, linePath, smoothStep, type ArcPath } from "./path";

/** 때리는 선수 기준의 방향 (월드 좌표, 길이 1) */
export interface StrikeFrame {
  /** 상대 쪽 앞 */
  forward: Vector3;
  up: Vector3;
  /** 때리는 손발이 있는 바깥쪽 (왼손이면 선수의 왼쪽) */
  outward: Vector3;
}

export interface StrikeTiming {
  /** 가드에서 기다리는 시간 */
  pre: number;
  /** 뻗는 시간 = 2 × 경로 길이 ÷ 속도 */
  extend: number;
  /** 닿은 채 머무는 시간 */
  hold: number;
  /** 되돌아오는 시간 */
  retract: number;
  /** 끝난 뒤 가드에서 기다리는 시간 */
  post: number;
  /** 닿는 시각 = pre + extend */
  contactTime: number;
  total: number;
}

export interface StrikeSample {
  /** 끝점(주먹 등) 위치 */
  effector: Vector3;
  /** 몸통 회전 정도 0~1 (1 = 그 기술의 최대 회전) */
  twist: number;
  phase: "pre" | "extend" | "hold" | "retract" | "post";
}

export interface StrikeMotion {
  technique: TechniqueId;
  path: ArcPath;
  timing: StrikeTiming;
  /** 몸통 최대 회전(°) — 뒷손·뒷발이면 그 어깨가 앞으로 오는 쪽 */
  twistDeg: number;
  /** 닿는 순간 끝점 속도(m/s) */
  contactSpeedMps: number;
  sample(t: number): StrikeSample;
}

/** 그림용 시간 값(초) */
export const MOTION_TIMES = { pre: 0.4, hold: 0.06, retract: 0.35, post: 0.4 };

/** 펀치별 몸통 최대 회전(°, 그림용) */
export const PUNCH_TWIST_DEG: Record<"jab" | "cross" | "hook" | "uppercut", number> = {
  jab: 8,
  cross: 35,
  hook: 30,
  uppercut: 20,
};

export type PunchId = keyof typeof PUNCH_TWIST_DEG;

/** 펀치 경로: 잽·크로스는 직선, 훅은 바깥에서 안으로 휘고, 어퍼컷은 아래로 내렸다가 위로 올라온다 */
export function punchPath(kind: PunchId, guard: Vector3, target: Vector3, frame: StrikeFrame): ArcPath {
  const D = guard.distanceTo(target);
  const down = frame.up.clone().negate();
  switch (kind) {
    case "jab":
    case "cross":
      return linePath(guard, target);
    case "hook":
      return bezierPath(
        guard,
        guard.clone().addScaledVector(frame.outward, 0.25 * D).addScaledVector(frame.forward, 0.1 * D),
        target.clone().addScaledVector(frame.outward, 0.35 * D).addScaledVector(frame.forward, -0.15 * D),
        target,
      );
    case "uppercut":
      return bezierPath(
        guard,
        guard.clone().addScaledVector(down, 0.15 * D),
        target.clone().addScaledVector(down, 0.4 * D).addScaledVector(frame.forward, -0.1 * D),
        target,
      );
  }
}

/** 경로·속도로 동작 하나를 만든다 */
export function buildStrikeMotion(
  technique: TechniqueId,
  path: ArcPath,
  guard: Vector3,
  contactSpeedMps: number,
  twistDeg: number,
): StrikeMotion {
  const extend = extendDuration(path.length, contactSpeedMps);
  const { pre, hold, retract, post } = MOTION_TIMES;
  const contactTime = pre + extend;
  const timing: StrikeTiming = { pre, extend, hold, retract, post, contactTime, total: contactTime + hold + retract + post };
  const target = path.at(path.length);

  return {
    technique,
    path,
    timing,
    twistDeg,
    contactSpeedMps,
    sample(t: number): StrikeSample {
      if (t < pre) return { effector: guard.clone(), twist: 0, phase: "pre" };
      if (t < contactTime) {
        const s = extendDistance(path.length, extend, t - pre);
        return { effector: path.at(s), twist: s / path.length, phase: "extend" };
      }
      if (t < contactTime + hold) return { effector: target.clone(), twist: 1, phase: "hold" };
      const r = (t - contactTime - hold) / retract;
      if (r < 1) {
        const u = smoothStep(r);
        return { effector: target.clone().lerp(guard, u), twist: 1 - u, phase: "retract" };
      }
      return { effector: guard.clone(), twist: 0, phase: "post" };
    },
  };
}

/** 펀치 동작 */
export function punchMotion(
  kind: PunchId,
  guard: Vector3,
  target: Vector3,
  frame: StrikeFrame,
  contactSpeedMps: number,
): StrikeMotion {
  return buildStrikeMotion(kind, punchPath(kind, guard, target, frame), guard, contactSpeedMps, PUNCH_TWIST_DEG[kind]);
}
