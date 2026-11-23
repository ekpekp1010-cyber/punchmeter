// Design Ref: §4.5 — 타격 하나를 무대에서 재생한다 (PLAN 작업 11: 펀치)
// 재생 순서: 두 선수 거리를 주먹이 닿을 만큼 맞춤 → 가드 자리·노린 부위 위치로 경로·속도 곡선을 만듦
// → 매 장면 몸통 회전과 팔 IK로 주먹을 경로 위에 놓는다. 닿는 순간 onContact를 한 번 부른다.

import * as THREE from "three";
import { punchMotion, PUNCH_TWIST_DEG, type PunchId, type StrikeFrame, type StrikeMotion } from "@/lib/motion/strikeMotion";
import { bodyPartInfo } from "@/lib/reference";
import type { BodyPart, Defense, FighterId, StrikeSide } from "@/lib/types";
import { LEAD_SIDE, type ArmSide, type FighterRig } from "./fighterRig";

export interface PunchRequest {
  attacker: FighterId;
  technique: PunchId;
  side: StrikeSide;
  target: BodyPart;
  speedMps: number;
  /** 맞는 선수의 수비 ("팔로 막음" 동작은 PLAN 작업 13) */
  defense: Defense;
}

/**
 * 닿는 순간 어깨~목표 거리를 팔 길이의 몇 %로 둘지 — 그림용.
 * 머리: 직선 펀치는 거의 다 펴고, 훅·어퍼컷은 굽힌 채. 몸통: 어깨에서 아래로 멀어 더 펴야 두 선수가 겹치지 않는다.
 */
const REACH_FRACTION: Record<"head" | "body", Record<PunchId, number>> = {
  head: { jab: 0.96, cross: 0.96, hook: 0.78, uppercut: 0.8 },
  body: { jab: 0.97, cross: 0.97, hook: 0.93, uppercut: 0.9 },
};
/** 주먹 마디를 표면에서 얼마나 바깥에 둘지(m, 기본 체형 기준) — 주먹 살 두께만큼 */
const SURFACE_GAP_M = 0.025;
/** 두 선수 발 사이 최소 거리(m) */
const MIN_DISTANCE_M = 0.45;

export interface ActiveStrike {
  request: PunchRequest;
  motion: StrikeMotion;
  arm: ArmSide;
  /** 몸통 회전 부호 (+면 오른 어깨가 앞으로) */
  twistSign: number;
  /** 재생 시각(동작 시간, 초) */
  time: number;
  /** 재생 속도 배율 (0.25 = 4배 느리게) */
  rate: number;
  contacted: boolean;
  /** 닿는 순간 주먹이 실제로 노린 곳에 닿았는가 (IK가 다 닿지 못하면 false) */
  reached: boolean;
}

export function armOf(side: StrikeSide): ArmSide {
  return side === "lead" ? LEAD_SIDE : LEAD_SIDE === "l" ? "r" : "l";
}

/** 노린 부위의 목표점 (표면에서 주먹 살 두께만큼 바깥) */
export function strikeTarget(defender: FighterRig, part: BodyPart): THREE.Vector3 {
  const from = defender.partFrom(part);
  return defender.partWorld(part).addScaledVector(from, SURFACE_GAP_M * defender.scale);
}

/**
 * 닿는 순간 어깨~목표 거리가 R이 되도록 두 선수 사이 거리를 바꿀 양.
 * 상대를 공격자→상대 방향(e)으로 Δ만큼 옮길 때 |w + Δe| = R (w = 목표 − 어깨)을 푼다.
 */
export function distanceShift(shoulder: THREE.Vector3, target: THREE.Vector3, e: THREE.Vector3, R: number): number {
  const w = target.clone().sub(shoulder);
  const b = w.dot(e);
  const disc = b * b - w.lengthSq() + R * R;
  if (disc < 0) return -b; // 옆으로 너무 멀면 가장 가까워지는 만큼만
  const r1 = -b + Math.sqrt(disc);
  const r2 = -b - Math.sqrt(disc);
  return Math.abs(r1) < Math.abs(r2) ? r1 : r2;
}

/** 공격자·방어자 장치와 무대 거리 조절 함수를 받아 펀치를 준비한다 */
export function preparePunch(
  req: PunchRequest,
  attacker: FighterRig,
  defender: FighterRig,
  getDistance: () => number,
  setDistance: (d: number) => void,
  rate: number,
): ActiveStrike {
  const arm = armOf(req.side);
  const twistSign = arm === "r" ? 1 : -1;
  const twistDeg = PUNCH_TWIST_DEG[req.technique] * twistSign;

  // 1) 거리 맞추기: 닿는 순간 자세(몸통 최대 회전)에서 어깨~목표 = 팔 길이 × 비율
  for (let i = 0; i < 3; i++) {
    attacker.beginFrame();
    attacker.setTwist(twistDeg);
    defender.beginFrame();
    defender.setTwist(0);
    defender.guard(undefined, req.defense === "none");
    const { upper, lower, hand } = attacker.armLengths(arm);
    const zone = bodyPartInfo(req.target).region === "head" ? "head" : "body";
    const R = (upper + lower + hand) * REACH_FRACTION[zone][req.technique];
    const S = attacker.shoulder(arm);
    const T = strikeTarget(defender, req.target);
    const e = defender.fighter.root.position.clone().sub(attacker.fighter.root.position).setY(0).normalize();
    const shift = distanceShift(S, T, e, R);
    setDistance(Math.max(MIN_DISTANCE_M, getDistance() + shift));
  }

  // 2) 가드 자세에서 출발점·목표·방향을 정해 경로를 만든다
  attacker.beginFrame();
  attacker.setTwist(0);
  attacker.guard();
  defender.beginFrame();
  defender.setTwist(0);
  defender.guard(undefined, req.defense === "none");
  const guard = attacker.guardPoint(arm);
  const target = strikeTarget(defender, req.target);
  const frame: StrikeFrame = {
    forward: attacker.forward(),
    up: new THREE.Vector3(0, 1, 0),
    outward: attacker.outward(arm),
  };
  const motion = punchMotion(req.technique, guard, target, frame, req.speedMps);
  return { request: req, motion, arm, twistSign, time: 0, rate, contacted: false, reached: true };
}

/** 공격자 자세를 시각 time에 맞춰 놓는다 (beginFrame 뒤에 부른다). 닿았는지 돌려준다 */
export function poseAttacker(strike: ActiveStrike, attacker: FighterRig): boolean {
  const sample = strike.motion.sample(strike.time);
  attacker.setTwist(strike.motion.twistDeg * strike.twistSign * sample.twist);
  attacker.guard(strike.arm);
  const raise = strike.request.technique === "hook" ? sample.twist : 0;
  return attacker.reachArm(strike.arm, sample.effector, attacker.elbowPole(strike.arm, raise));
}
