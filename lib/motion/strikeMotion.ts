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

// ── 킥·팔꿈치·무릎 (PLAN 작업 12) ──
// 끝점: 돌려차기류(로우·카프·미들·하이)는 정강이, 프런트·사이드킥은 발, 팔꿈치는 팔꿈치, 무릎은 무릎.
// 경로 모양은 보기 좋게 정한 그림용 값이고, 닿는 순간 속도는 펀치와 같은 속도 곡선으로 정해진다.

/** 몸통(척추) 최대 회전(°, 그림용) — 펀치 포함 12가지 */
export const STRIKE_TWIST_DEG: Record<TechniqueId, number> = {
  ...PUNCH_TWIST_DEG,
  lowKick: 20,
  calfKick: 20,
  middleKick: 25,
  highKick: 25,
  frontKick: 5,
  sideKick: 15,
  elbow: 35,
  knee: 15,
};

/** 골반(엉덩이) 최대 회전(°, 그림용) — 돌려차기는 엉덩이를 돌리고, 사이드킥은 옆으로 선다 */
export const HIP_TWIST_DEG: Record<TechniqueId, number> = {
  jab: 0,
  cross: 10,
  hook: 8,
  uppercut: 5,
  lowKick: 40,
  calfKick: 40,
  middleKick: 55,
  highKick: 60,
  frontKick: 10,
  sideKick: 75,
  elbow: 15,
  knee: 20,
};

/** 몸통을 뒤로 젖히는 최대 각도(°, 그림용) — 높이 찰수록 크다 */
export const LEAN_BACK_DEG: Record<TechniqueId, number> = {
  jab: 0,
  cross: 0,
  hook: 0,
  uppercut: 0,
  lowKick: 8,
  calfKick: 8,
  middleKick: 15,
  highKick: 25,
  frontKick: 12,
  sideKick: 20,
  elbow: 0,
  knee: 10,
};

/** 기술 하나의 끝점 경로 (start = 가드 자세에서의 끝점 위치) */
export function strikePath(technique: TechniqueId, start: Vector3, target: Vector3, frame: StrikeFrame): ArcPath {
  if (technique in PUNCH_TWIST_DEG) return punchPath(technique as PunchId, start, target, frame);
  const D = start.distanceTo(target);
  const up = frame.up;
  const f = frame.forward;
  const out = frame.outward;
  const rise = Math.max(0, target.clone().sub(start).dot(up));
  switch (technique) {
    // 돌려차기: 바깥으로 크게 돌아 올라갔다가 옆에서 안으로 들어온다
    case "lowKick":
    case "calfKick":
    case "middleKick":
    case "highKick":
      return bezierPath(
        start,
        start.clone().addScaledVector(out, 0.35 * D).addScaledVector(up, 0.3 * rise + 0.1 * D),
        target.clone().addScaledVector(out, 0.5 * D).addScaledVector(f, -0.2 * D),
        target,
      );
    // 앞차기: 무릎을 들어 올렸다가(접기) 앞으로 곧게 민다
    case "frontKick":
      return bezierPath(
        start,
        start.clone().addScaledVector(up, 0.6 * rise + 0.2 * D).addScaledVector(f, 0.1 * D),
        target.clone().addScaledVector(f, -0.45 * D),
        target,
      );
    // 옆차기: 무릎을 몸 앞으로 접었다가 옆(상대 쪽)으로 곧게 민다
    case "sideKick":
      return bezierPath(
        start,
        start.clone().addScaledVector(up, 0.6 * rise + 0.2 * D).addScaledVector(out, -0.1 * D),
        target.clone().addScaledVector(f, -0.5 * D),
        target,
      );
    // 팔꿈치: 옆에서 수평으로 휘둘러 들어온다
    case "elbow":
      return bezierPath(
        start,
        start.clone().addScaledVector(out, 0.3 * D).addScaledVector(up, 0.05 * D),
        target.clone().addScaledVector(out, 0.4 * D).addScaledVector(f, -0.1 * D),
        target,
      );
    // 무릎: 아래에서 앞·위로 찔러 올린다
    case "knee":
      return bezierPath(
        start,
        start.clone().addScaledVector(f, 0.15 * D).addScaledVector(up, -0.05 * D),
        target.clone().addScaledVector(f, -0.35 * D).addScaledVector(up, -0.25 * D),
        target,
      );
    default:
      return linePath(start, target);
  }
}

/** 기술 하나의 동작 (12가지 모두) */
export function strikeMotion(
  technique: TechniqueId,
  start: Vector3,
  target: Vector3,
  frame: StrikeFrame,
  contactSpeedMps: number,
): StrikeMotion {
  return buildStrikeMotion(
    technique,
    strikePath(technique, start, target, frame),
    start,
    contactSpeedMps,
    STRIKE_TWIST_DEG[technique],
  );
}

/** 골반을 옆으로 기울이는 최대 각도(°, 그림용) — 차는 쪽 엉덩이를 올려 높은 곳을 찬다 */
export const HIP_ROLL_DEG: Record<TechniqueId, number> = {
  jab: 0,
  cross: 0,
  hook: 0,
  uppercut: 0,
  lowKick: 5,
  calfKick: 3,
  middleKick: 15,
  highKick: 28,
  frontKick: 0,
  sideKick: 22,
  elbow: 0,
  knee: 5,
};
