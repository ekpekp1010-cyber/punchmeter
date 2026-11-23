// Design Ref: §4.5 — 타격 하나를 무대에서 재생한다 (PLAN 작업 11 펀치, 작업 12 킥·팔꿈치·무릎)
// 재생 순서:
//   1) 두 선수 거리를 끝점이 닿을 만큼 맞춘다 (닿는 순간 자세에서 어깨·엉덩이~목표 = 팔다리 길이 × 비율)
//   2) 가드 자세의 끝점에서 노린 부위까지 경로를 만든다 (lib/motion/strikeMotion.ts)
//   3) 캐릭터를 경로대로 미리 움직여 보고, 끝점이 "실제로" 지나간 길을 기록한다
//      (팔꿈치·무릎처럼 뼈 하나로 움직이면 끝점이 경로에서 조금 벗어나기 때문)
//   4) 그 실제 길 위에 속도 곡선을 입힌다 → 화면 속 끝점의 닿는 순간 속도 = 정한 속도
// 매 장면 몸통·골반 회전과 팔다리 IK로 자세를 놓고, 닿는 순간 onContact를 한 번 부른다.

import * as THREE from "three";
import { arcPath, extendDistance, extendDuration, smoothStep } from "@/lib/motion/path";
import {
  HIP_ROLL_DEG,
  HIP_TWIST_DEG,
  LEAN_BACK_DEG,
  MOTION_TIMES,
  STRIKE_TWIST_DEG,
  strikePath,
  type StrikeFrame,
  type StrikeTiming,
} from "@/lib/motion/strikeMotion";
import { resolveHitPart } from "@/lib/lab/medical";
import { bodyPartInfo, techniqueInfo } from "@/lib/reference";
import type { BodyPart, Defense, FighterId, StrikeSide, TechniqueId } from "@/lib/types";
import { FighterRig, LEAD_SIDE, type ArmSide } from "./fighterRig";

export interface StrikeRequest {
  attacker: FighterId;
  technique: TechniqueId;
  side: StrikeSide;
  target: BodyPart;
  speedMps: number;
  /** 맞는 선수의 수비 ("팔로 막음" 동작은 PLAN 작업 13) */
  defense: Defense;
}

/** 이전 이름 (펀치만 받던 때) */
export type PunchRequest = StrikeRequest;

type Effector = "fist" | "shin" | "foot" | "knee" | "elbow";

/** 기술별 설정 — 모두 그림용 값 */
interface TechSpec {
  effector: Effector;
  /** 닿는 순간 뿌리(어깨·엉덩이)~목표 거리를 팔다리 길이의 몇 %로 둘지 (머리 / 몸통) */
  reach: { head: number; body: number };
  /** 끝점을 표면에서 얼마나 바깥에 둘지(m) — 살 두께 */
  gapM: number;
  /** 돌려차기에서 정강이 어디로 차는지 (무릎에서 발목 쪽 비율). 높거나 낮은 곳일수록 발목 가까이 */
  shinFrac?: number;
  /** 두 선수 발 사이 최소 거리(m). 팔꿈치·무릎은 바짝 붙어 친다 */
  minDistanceM: number;
  /** 발끝으로 몸을 들어 올리는 최대 높이(m, 기본 체형 기준) — 하이킥 */
  riseM?: number;
}

const SPEC: Record<TechniqueId, TechSpec> = {
  jab: { effector: "fist", reach: { head: 0.96, body: 0.97 }, gapM: 0.025, minDistanceM: 0.45 },
  cross: { effector: "fist", reach: { head: 0.96, body: 0.97 }, gapM: 0.025, minDistanceM: 0.45 },
  hook: { effector: "fist", reach: { head: 0.78, body: 0.93 }, gapM: 0.025, minDistanceM: 0.45 },
  uppercut: { effector: "fist", reach: { head: 0.8, body: 0.9 }, gapM: 0.025, minDistanceM: 0.45 },
  lowKick: { effector: "shin", reach: { head: 0.93, body: 0.93 }, gapM: 0.05, shinFrac: 0.55, minDistanceM: 0.45 },
  calfKick: { effector: "shin", reach: { head: 0.95, body: 0.95 }, gapM: 0.05, shinFrac: 0.9, minDistanceM: 0.45 },
  middleKick: { effector: "shin", reach: { head: 0.95, body: 0.95 }, gapM: 0.05, shinFrac: 0.65, minDistanceM: 0.45 },
  highKick: { effector: "shin", reach: { head: 0.97, body: 0.97 }, gapM: 0.05, shinFrac: 0.9, minDistanceM: 0.45, riseM: 0.06 },
  frontKick: { effector: "foot", reach: { head: 0.94, body: 0.94 }, gapM: 0.06, minDistanceM: 0.45 },
  sideKick: { effector: "foot", reach: { head: 0.95, body: 0.95 }, gapM: 0.06, minDistanceM: 0.45 },
  knee: { effector: "knee", reach: { head: 0.99, body: 0.99 }, gapM: 0.05, minDistanceM: 0.3 },
  elbow: { effector: "elbow", reach: { head: 0.99, body: 0.99 }, gapM: 0.02, minDistanceM: 0.3 },
};

const shinFracOf = (t: TechniqueId) => SPEC[t].shinFrac ?? 0.6;
/** 실제 길을 기록할 때 나누는 개수 */
const TRACE_SAMPLES = 160;

/** 재생용 동작: 실제 끝점 길 위에서 시간을 맞춘 것 */
export interface PlayMotion {
  timing: StrikeTiming;
  contactSpeedMps: number;
  /** 경로 진행 정도 0~1 (몸통 회전·IK 목표를 정한다) */
  progress(t: number): number;
  /** 시각 t의 IK 목표 위치 */
  desired(t: number): THREE.Vector3;
}

export interface ActiveStrike {
  request: StrikeRequest;
  motion: PlayMotion;
  /** 때리는 팔·다리 쪽 */
  limbSide: ArmSide;
  /** 회전 부호 (+면 오른쪽이 앞으로) */
  twistSign: number;
  /** 재생 시각(동작 시간, 초) */
  time: number;
  /** 재생 속도 배율 (0.25 = 4배 느리게) */
  rate: number;
  contacted: boolean;
  /** 닿는 순간 끝점이 노린 곳에 닿았는가 */
  reached: boolean;
  /** 닿는 순간 끝점 위치 (월드) */
  contactPoint: THREE.Vector3;
  /** 닿는 순간 진행 방향 (월드, 길이 1) */
  contactDir: THREE.Vector3;
  /** 실제로 닿은 부위 (막았으면 막은 팔다리) */
  hitPart: BodyPart;
}

/** 앞손·앞발이면 왼쪽(오소독스), 뒷손·뒷발이면 오른쪽 */
export function armOf(side: StrikeSide): ArmSide {
  return side === "lead" ? LEAD_SIDE : LEAD_SIDE === "l" ? "r" : "l";
}

/** 노린 부위의 목표점 (표면에서 끝점 살 두께만큼 바깥) */
export function strikeTarget(defender: FighterRig, part: BodyPart, gapM = 0.025): THREE.Vector3 {
  const from = defender.partFrom(part);
  return defender.partWorld(part).addScaledVector(from, gapM * defender.scale);
}

/**
 * 닿는 순간 뿌리~목표 거리가 R이 되도록 두 선수 사이 거리를 바꿀 양.
 * 상대를 공격자→상대 방향(e)으로 Δ만큼 옮길 때 |w + Δe| = R (w = 목표 − 뿌리)을 푼다.
 */
export function distanceShift(root: THREE.Vector3, target: THREE.Vector3, e: THREE.Vector3, R: number): number {
  const w = target.clone().sub(root);
  const b = w.dot(e);
  const disc = b * b - w.lengthSq() + R * R;
  if (disc < 0) return -b; // 옆으로 너무 멀면 가장 가까워지는 만큼만
  const r1 = -b + Math.sqrt(disc);
  const r2 = -b - Math.sqrt(disc);
  return Math.abs(r1) < Math.abs(r2) ? r1 : r2;
}

/** 끝점의 실제 위치 */
function effectorPos(rig: FighterRig, technique: TechniqueId, side: ArmSide): THREE.Vector3 {
  const effector = SPEC[technique].effector;
  switch (effector) {
    case "fist":
      return rig.pos(`middle_01_${side}`);
    case "shin":
      return rig.shinPoint(side, shinFracOf(technique));
    case "foot":
      return rig.pos(`foot_${side}`);
    case "knee":
      return rig.kneePos(side);
    case "elbow":
      return rig.elbowTip(side);
  }
}

/** 뿌리(어깨·엉덩이) 위치와 팔다리 길이 */
function rootAndLength(rig: FighterRig, technique: TechniqueId, side: ArmSide): { root: THREE.Vector3; length: number } {
  const effector = SPEC[technique].effector;
  if (effector === "fist") {
    const { upper, lower, hand } = rig.armLengths(side);
    return { root: rig.shoulder(side), length: upper + lower + hand };
  }
  if (effector === "elbow") {
    return { root: rig.shoulder(side), length: rig.armLengths(side).upper + FighterRig.ELBOW_TIP_M * rig.scale };
  }
  const { thigh, shank } = rig.legLengths(side);
  const length = effector === "knee" ? thigh : effector === "shin" ? thigh + shank * shinFracOf(technique) : thigh + shank;
  return { root: rig.hip(side), length };
}

/** 진행 정도 u(0~1)의 몸통·골반 자세 */
function poseBody(rig: FighterRig, technique: TechniqueId, sign: number, u: number) {
  const isLeg = ["shin", "foot", "knee"].includes(SPEC[technique].effector);
  const kicking: ArmSide = sign > 0 ? "r" : "l";
  const standing: ArmSide = sign > 0 ? "l" : "r";
  const hipTwist = HIP_TWIST_DEG[technique] * sign * u;
  // 차는 쪽 엉덩이가 올라가게 기울인다 (+각도면 왼쪽이 올라감 → 오른발(sign +)은 −)
  rig.setHips(hipTwist, LEAN_BACK_DEG[technique] * u, -HIP_ROLL_DEG[technique] * sign * u);
  rig.setTwist(STRIKE_TWIST_DEG[technique] * sign * u);
  rig.setRise((SPEC[technique].riseM ?? 0) * rig.scale * u);
  // 골반을 돌리고 기울인 뒤 발을 다시 서는 자세 자리에 놓는다 (왼발 앞·오른발 뒤 유지).
  // 차는 다리는 poseLimb가 놓고, 디딤발은 골반이 도는 만큼 발끝을 돌린다 (그림용 비율 0.8)
  if (isLeg) rig.plantFeet(kicking, { side: standing, deg: hipTwist * 0.8 });
  else rig.plantFeet();
}

/** 끝점을 목표에 놓는 팔다리 자세 (몸통 자세 뒤에 부른다). 닿았는지 돌려준다 */
function poseLimb(rig: FighterRig, technique: TechniqueId, side: ArmSide, goal: THREE.Vector3, u: number): boolean {
  const effector = SPEC[technique].effector;
  switch (effector) {
    case "fist":
      rig.guard(side);
      return rig.reachArm(side, goal, rig.elbowPole(side, technique === "hook" ? u : 0));
    case "elbow":
      rig.guard(side);
      return rig.reachElbow(side, goal);
    case "shin":
      rig.guard();
      return rig.reachLeg(side, goal, rig.kneePole(side, u), shinFracOf(technique));
    case "foot": {
      rig.guard();
      const up = new THREE.Vector3(0, 1, 0);
      if (technique === "frontKick") {
        return rig.reachLeg(side, goal, rig.kneePole(side, 0).add(up.clone().multiplyScalar(0.5)), 1, up);
      }
      return rig.reachLeg(side, goal, rig.hip(side).add(up), 1, rig.outward(side).negate());
    }
    case "knee":
      rig.guard();
      return rig.reachKnee(side, goal);
  }
}

/**
 * 맞는 선수 자세 (PLAN 작업 13). beginFrame 뒤에 부른다.
 * - 수비 "맞음": 가드를 가슴 높이로 내려 노린 곳이 보이게 한다
 * - "팔로 막음": 노린 쪽 팔을 올려 아래팔로 얼굴 옆·옆구리를 가린다 (머리면 주먹을 노린 곳 앞에, 몸통이면 팔꿈치를 내려 옆구리에)
 * - 로우킥·카프킥을 막으면: 그쪽 무릎을 들어 바깥으로 돌려 정강이로 받는다 (체크)
 */
export function poseDefenderFor(req: StrikeRequest, defender: FighterRig) {
  defender.setTwist(0);
  if (req.defense === "none") {
    defender.guard(undefined, true);
    return;
  }
  const { hitPart } = resolveHitPart({ ...req, speedBasis: "research" });
  const side: ArmSide = hitPart.endsWith("Left") ? "l" : "r";
  const s = defender.scale;
  const up = new THREE.Vector3(0, 1, 0);
  if (hitPart.startsWith("shin")) {
    defender.guard();
    const knee = defender
      .hip(side)
      .addScaledVector(defender.forward(), 0.3 * s)
      .addScaledVector(defender.outward(side), 0.12 * s)
      .addScaledVector(up, 0.05 * s);
    defender.reachKnee(side, knee);
    return;
  }
  defender.guard(side);
  const head = bodyPartInfo(req.target).region === "head";
  const point = head
    ? defender.partWorld(req.target).addScaledVector(defender.partFrom(req.target), 0.1 * s).addScaledVector(up, 0.04 * s)
    : defender.guardPoint(side).addScaledVector(defender.outward(side), 0.05 * s).addScaledVector(up, -0.02 * s);
  // 머리를 막을 때는 팔꿈치를 앞·아래로, 몸통을 막을 때는 팔꿈치를 옆구리로 내린다
  const pole = defender.shoulder(side).addScaledVector(up, -1).addScaledVector(defender.forward(), head ? 0.6 : 0.1);
  defender.reachArm(side, point, pole);
}

/** 공격자·방어자 장치와 무대 거리 조절 함수를 받아 타격을 준비한다 */
export function prepareStrike(
  req: StrikeRequest,
  attacker: FighterRig,
  defender: FighterRig,
  getDistance: () => number,
  setDistance: (d: number) => void,
  rate: number,
): ActiveStrike {
  const limbSide = armOf(req.side);
  const twistSign = limbSide === "r" ? 1 : -1;
  const spec = SPEC[req.technique];
  const zone = bodyPartInfo(req.target).region === "head" ? "head" : "body";
  // 실제로 닿는 부위: 막으면 아래팔(로우·카프킥은 정강이) — lib/lab/medical.ts와 같은 규칙
  const { hitPart } = resolveHitPart({ ...req, speedBasis: "research" });

  const poseDefender = () => {
    defender.beginFrame();
    poseDefenderFor(req, defender);
  };
  // 끝점(주먹 마디)~닿는 면 거리(월드 m): 글러브를 낀 펀치면 글러브 앞면까지, 아니면 살 두께
  const gloveGap = spec.effector === "fist" ? attacker.gloveFrontGap(limbSide) : null;
  // 얇은 글러브(4oz)라도 맨손 살 두께보다 얇게 잡지 않는다
  const gap = Math.max(gloveGap ?? 0, spec.gapM * defender.scale);
  /** 닿을 곳: 노린 부위(막았으면 막은 팔다리) 표면에서 닿는 면 두께만큼 바깥 */
  const aimPoint = () => {
    if (hitPart === req.target) return defender.partWorld(req.target).addScaledVector(defender.partFrom(req.target), gap);
    const toAttacker = attacker.fighter.root.position.clone().sub(defender.fighter.root.position).setY(0).normalize();
    return defender.partWorld(hitPart).addScaledVector(toAttacker, gap);
  };

  // 1) 거리 맞추기: 닿는 순간 자세(회전 최대)에서 뿌리~목표 = 팔다리 길이 × 비율
  for (let i = 0; i < 3; i++) {
    attacker.beginFrame();
    poseBody(attacker, req.technique, twistSign, 1);
    poseDefender();
    const { root, length } = rootAndLength(attacker, req.technique, limbSide);
    const T = aimPoint();
    const e = defender.fighter.root.position.clone().sub(attacker.fighter.root.position).setY(0).normalize();
    setDistance(Math.max(spec.minDistanceM, getDistance() + distanceShift(root, T, e, length * spec.reach[zone])));
  }

  // 2) 가드 자세의 끝점에서 목표까지 경로
  poseDefender();
  const target = aimPoint();
  attacker.beginFrame();
  poseBody(attacker, req.technique, twistSign, 0);
  attacker.guard(); // 가드 자세 (다리는 선 자세)
  const start = effectorPos(attacker, req.technique, limbSide);
  const frame: StrikeFrame = {
    forward: attacker.forward(),
    up: new THREE.Vector3(0, 1, 0),
    outward: attacker.outward(limbSide),
  };
  const planned = strikePath(req.technique, start, target, frame);

  // 3) 경로대로 미리 움직여 끝점이 실제로 지나간 길을 기록 (u = 계획 경로 진행 정도)
  const us: number[] = [];
  const actual: THREE.Vector3[] = [];
  let reached = true;
  for (let i = 0; i <= TRACE_SAMPLES; i++) {
    const u = i / TRACE_SAMPLES;
    attacker.beginFrame();
    poseBody(attacker, req.technique, twistSign, u);
    const ok = poseLimb(attacker, req.technique, limbSide, planned.at(u * planned.length), u);
    if (i === TRACE_SAMPLES) reached = ok;
    us.push(u);
    actual.push(effectorPos(attacker, req.technique, limbSide));
  }
  const actualPath = arcPath((u, out) => {
    const x = u * TRACE_SAMPLES;
    const i = Math.min(TRACE_SAMPLES - 1, Math.floor(x));
    return out.copy(actual[i]).lerp(actual[i + 1], x - i);
  }, TRACE_SAMPLES);
  // 실제 길 위 길이 → 계획 경로 진행 정도 u
  const cumulative = [0];
  for (let i = 1; i <= TRACE_SAMPLES; i++) cumulative.push(cumulative[i - 1] + actual[i].distanceTo(actual[i - 1]));
  const uAtLength = (s: number) => {
    if (s <= 0) return 0;
    if (s >= cumulative[TRACE_SAMPLES]) return 1;
    let lo = 0;
    let hi = TRACE_SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= s) lo = mid;
      else hi = mid;
    }
    return us[lo] + ((s - cumulative[lo]) / (cumulative[hi] - cumulative[lo])) * (us[hi] - us[lo]);
  };

  // 4) 실제 길 위에 속도 곡선 → 시간표
  const extend = extendDuration(actualPath.length, req.speedMps);
  const { pre, hold, retract, post } = MOTION_TIMES;
  const contactTime = pre + extend;
  const timing: StrikeTiming = { pre, extend, hold, retract, post, contactTime, total: contactTime + hold + retract + post };
  const progress = (t: number) => {
    if (t < pre) return 0;
    if (t < contactTime) return uAtLength(extendDistance(actualPath.length, extend, t - pre));
    if (t < contactTime + hold) return 1;
    const r = (t - contactTime - hold) / retract;
    return r < 1 ? 1 - smoothStep(r) : 0;
  };
  const motion: PlayMotion = {
    timing,
    contactSpeedMps: req.speedMps,
    progress,
    desired: (t: number) => planned.at(progress(t) * planned.length),
  };
  // 닿는 순간 진행 방향 = 실제 끝점 길의 마지막 방향 (화살표용)
  const contactDir = actual[TRACE_SAMPLES].clone().sub(actual[TRACE_SAMPLES - 1]).normalize();
  return {
    request: req,
    motion,
    limbSide,
    twistSign,
    time: 0,
    rate,
    contacted: false,
    reached,
    contactPoint: actual[TRACE_SAMPLES].clone(),
    contactDir,
    hitPart,
  };
}

/** 이전 이름 (펀치만 받던 때) */
export const preparePunch = prepareStrike;

/** 공격자 자세를 시각 time에 맞춰 놓는다 (beginFrame 뒤에 부른다). 닿았는지 돌려준다 */
export function poseAttacker(strike: ActiveStrike, attacker: FighterRig): boolean {
  // 준비 시간에는 가드 자세로 선다 (이때 두 선수 거리가 천천히 바뀐다)
  if (strike.time < strike.motion.timing.pre) {
    attacker.setTwist(0);
    attacker.guard();
    return true;
  }
  const u = strike.motion.progress(strike.time);
  poseBody(attacker, strike.request.technique, strike.twistSign, u);
  return poseLimb(attacker, strike.request.technique, strike.limbSide, strike.motion.desired(strike.time), u);
}

/** 그 기술의 끝점 위치 (화살표 등 다음 작업에서 쓴다) */
export function strikeEffector(strike: ActiveStrike, attacker: FighterRig): THREE.Vector3 {
  return effectorPos(attacker, strike.request.technique, strike.limbSide);
}

/** 이 기술을 3D로 재생할 수 있는가 */
export function canPlay(technique: TechniqueId): boolean {
  return technique in SPEC && Boolean(techniqueInfo(technique));
}
