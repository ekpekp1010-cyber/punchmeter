// Design Ref: §3 데이터 흐름 ⑤ 접촉 판정 — PLAN 작업 10(접촉 판정)의 바탕을 앞당겨 만든다.
// PRD 원칙: 상대 몸(또는 샌드백·미트)에 닿은 경우만 타격으로 인정한다. 팔·글러브로 막힌 타격은 따로 센다.
//
// 한 장면을 판정할 때 바로 앞·뒤 장면을 함께 본다 (그래서 판정은 장면 한 칸 늦게 나온다).
// 아래 네 가지를 모두 만족해야 "닿음"으로 본다.
//  1) 빠름: 주먹(손목)·발(발목)이 자기 몸 기준으로 빠르게 움직였다 (스텝·몸 전체 이동은 빠짐)
//  2) 향함: 그 움직임이 상대 몸 쪽을 향했다
//  3) 닿음: 주먹·정강이~발이 상대 몸의 테두리(머리·몸통·팔·다리 덩어리)에 닿았다
//  4) 멈춤: 바로 다음 장면에서 그 방향으로 더 나아가지 못하고 멈추거나 되돌아왔다 (부딪힘)
// 화면(2D) 기준이라, 앞뒤로 떨어져 있는데 화면에서 겹쳐 보이는 경우는 닿은 것으로 잘못 볼 수 있다.

import type { PoseLandmark } from "../types";
import { segmentParam } from "../physics/body";
import { STRIKE_BENCHMARKS } from "../reference/strikes";
import { LANDMARK as L } from "./landmarks";
import type { TrackedPerson } from "./poseTracker";

export type StrikeLimb = "punch" | "kick";
/** 닿은 상대 부위 (팔에 닿으면 막힌 것) */
export type TargetRegion = "head" | "torso" | "arm" | "leg";
export type StrikeOutcome = "hit" | "blocked";

/** 닿은 타격 하나 */
export interface StrikeContact {
  /** 때린 선수 (0 = 빨강, 1 = 파랑) */
  slot: number;
  limb: StrikeLimb;
  /** 손목·발목 관절 번호 */
  joint: number;
  /** 닿은 순간 (영상 속 초) */
  t: number;
  /** 화살표 시작점 = 닿은 순간의 주먹·발 위치 (화면 비율 0~1) */
  x: number;
  y: number;
  /** 닿기 직전 진행 방향 (단위 벡터, 화면 높이 기준) */
  dirX: number;
  dirY: number;
  /** 세기 0~1 (공개 기록의 펀치 속도에 닿으면 1) */
  strength: number;
  region: TargetRegion;
  outcome: StrikeOutcome;
}

// ─────────────────────────────────────────────
// 설정값
// ─────────────────────────────────────────────

/** 몸통 길이(m): de Leva 1996 남녀 평균. 화면 속 몸통 길이를 m로 어림하는 기준 */
export const TRUNK_LENGTH_M = (() => {
  const { lengthMm } = segmentParam("trunk");
  return (lengthMm.male + lengthMm.female) / 2 / 1000;
})();

/** 화살표 세기가 가장 큰 속도 (m/s): 올림픽 복서 스트레이트 펀치 속도 (Walilko 2005) */
export const FULL_STRENGTH_SPEED_MPS = STRIKE_BENCHMARKS.find((b) => b.strike === "straightPunch" && b.measure === "velocity")!
  .value as number;

// 아래는 측정값이 아니라 판정용 설정값이다 (실제 영상 시험 후 조정).
/** 1) 이보다 빨라야 공격으로 본다 (m/s). 가드를 고쳐 잡는 느린 손동작을 빼기 위한 값 */
export const MIN_STRIKE_SPEED_MPS = 2;
/** 2) 진행 방향과 "상대 몸 쪽" 방향이 이보다 비슷해야 한다 (코사인, 0.5 = 60° 안쪽) */
const MIN_APPROACH_COS = 0.5;
/** 3) 몸 테두리와 이 거리(몸통 길이 비율) 안이면 닿은 것으로 본다 */
const CONTACT_GAP_TORSO = 0.05;
/** 4) 다음 장면에서 같은 방향으로 이 비율 넘게 계속 나아가면 닿지 않고 스친 것으로 본다 */
const MAX_FOLLOW_THROUGH = 0.6;
/** 같은 주먹·발의 판정이 이 시간(초) 안에 또 나오면 같은 타격으로 본다 */
const SAME_STRIKE_SEC = 0.3;
/** 관절이 이보다 잘 보여야 판정에 쓴다 */
const MIN_VISIBILITY = 0.5;

/**
 * 몸 덩어리 굵기 (반지름, 몸통 길이 비율). de Leva 1996 분절 길이와 보통 체형을 바탕으로 한 어림값 (판정용 설정값).
 * 몸통은 어깨·엉덩이 네 점을 이은 사각형에 이 두께를 더한다.
 */
const RADIUS_TORSO = {
  head: 0.22,
  torso: 0.08,
  upperArm: 0.09,
  forearm: 0.08,
  thigh: 0.14,
  shank: 0.1,
  fist: 0.08,
  foot: 0.07,
} as const;

// ─────────────────────────────────────────────
// 2D 도형 계산 (단위: 화면 높이. x는 가로÷세로 비율을 곱해 보정)
// ─────────────────────────────────────────────

interface P {
  x: number;
  y: number;
}
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y;
const norm = (a: P) => Math.hypot(a.x, a.y);
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 점에서 선분까지 가장 가까운 점 */
function closestOnSegment(p: P, a: P, b: P): P {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const u = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2)) : 0;
  return { x: a.x + ab.x * u, y: a.y + ab.y * u };
}

function insidePolygon(p: P, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 상대 몸 덩어리 하나: 선분(굵기 있음) 또는 다각형 */
type Shape =
  | { region: TargetRegion; kind: "capsule"; a: P; b: P; r: number }
  | { region: TargetRegion; kind: "polygon"; pts: P[]; r: number };

/** 점에서 덩어리 테두리까지 거리 (안쪽이면 0 이하)와 가장 가까운 점 */
function distanceToShape(p: P, s: Shape): { d: number; at: P } {
  if (s.kind === "capsule") {
    const at = closestOnSegment(p, s.a, s.b);
    return { d: norm(sub(p, at)) - s.r, at };
  }
  if (insidePolygon(p, s.pts)) return { d: -s.r, at: p };
  let best = { d: Infinity, at: p };
  for (let i = 0; i < s.pts.length; i++) {
    const at = closestOnSegment(p, s.pts[i], s.pts[(i + 1) % s.pts.length]);
    const d = norm(sub(p, at)) - s.r;
    if (d < best.d) best = { d, at };
  }
  return best;
}

// ─────────────────────────────────────────────
// 선수 몸 읽기
// ─────────────────────────────────────────────

interface Body {
  /** 화면 속 몸통 길이 (화면 높이 단위) */
  torso: number;
  hip: P;
  pt: (i: number) => P;
  ok: (...joints: number[]) => boolean;
}

function readBody(person: TrackedPerson, aspect: number): Body | null {
  const image: PoseLandmark[] = person.image;
  const estimated = new Set(person.estimatedJoints);
  const pt = (i: number): P => ({ x: image[i].x * aspect, y: image[i].y });
  const ok = (...joints: number[]) =>
    joints.every((j) => image[j] && image[j].visibility >= MIN_VISIBILITY && !estimated.has(j));
  if (!image[L.leftShoulder] || !image[L.leftHip]) return null;
  const sh = mid(pt(L.leftShoulder), pt(L.rightShoulder));
  const hip = mid(pt(L.leftHip), pt(L.rightHip));
  const torso = norm(sub(sh, hip));
  if (torso < 0.01) return null;
  return { torso, hip, pt, ok };
}

/** 상대 몸을 덩어리들로 나눈다 (잘 보이는 부위만) */
function bodyShapes(b: Body): Shape[] {
  const t = b.torso;
  const shapes: Shape[] = [];
  if (b.ok(L.leftShoulder, L.rightShoulder, L.leftHip, L.rightHip)) {
    shapes.push({
      region: "torso",
      kind: "polygon",
      pts: [b.pt(L.leftShoulder), b.pt(L.rightShoulder), b.pt(L.rightHip), b.pt(L.leftHip)],
      r: RADIUS_TORSO.torso * t,
    });
  }
  if (b.ok(L.leftEar, L.rightEar)) {
    const c = mid(b.pt(L.leftEar), b.pt(L.rightEar));
    shapes.push({ region: "head", kind: "capsule", a: c, b: c, r: RADIUS_TORSO.head * t });
  } else if (b.ok(L.nose)) {
    const c = b.pt(L.nose);
    shapes.push({ region: "head", kind: "capsule", a: c, b: c, r: RADIUS_TORSO.head * t });
  }
  const limbs: [TargetRegion, number, number, number][] = [
    ["arm", L.leftShoulder, L.leftElbow, RADIUS_TORSO.upperArm],
    ["arm", L.rightShoulder, L.rightElbow, RADIUS_TORSO.upperArm],
    ["arm", L.leftElbow, L.leftWrist, RADIUS_TORSO.forearm],
    ["arm", L.rightElbow, L.rightWrist, RADIUS_TORSO.forearm],
    ["leg", L.leftHip, L.leftKnee, RADIUS_TORSO.thigh],
    ["leg", L.rightHip, L.rightKnee, RADIUS_TORSO.thigh],
    ["leg", L.leftKnee, L.leftAnkle, RADIUS_TORSO.shank],
    ["leg", L.rightKnee, L.rightAnkle, RADIUS_TORSO.shank],
  ];
  for (const [region, a, c, r] of limbs) {
    if (b.ok(a, c)) shapes.push({ region, kind: "capsule", a: b.pt(a), b: b.pt(c), r: r * t });
  }
  return shapes;
}

interface StrikeTool {
  joint: number;
  limb: StrikeLimb;
  /** 때리는 면 (선분): 주먹 = 손목~손 가운데, 킥 = 정강이 아래쪽 절반~발끝 */
  surface: (b: Body) => [P, P] | null;
  radius: number;
}

const handMid = (b: Body, pinky: number, index: number) => mid(b.pt(pinky), b.pt(index));

const STRIKE_TOOLS: StrikeTool[] = [
  {
    joint: L.leftWrist,
    limb: "punch",
    surface: (b) => (b.ok(L.leftWrist) ? [b.pt(L.leftWrist), b.ok(L.leftPinky, L.leftIndex) ? handMid(b, L.leftPinky, L.leftIndex) : b.pt(L.leftWrist)] : null),
    radius: RADIUS_TORSO.fist,
  },
  {
    joint: L.rightWrist,
    limb: "punch",
    surface: (b) => (b.ok(L.rightWrist) ? [b.pt(L.rightWrist), b.ok(L.rightPinky, L.rightIndex) ? handMid(b, L.rightPinky, L.rightIndex) : b.pt(L.rightWrist)] : null),
    radius: RADIUS_TORSO.fist,
  },
  {
    joint: L.leftAnkle,
    limb: "kick",
    surface: (b) =>
      b.ok(L.leftKnee, L.leftAnkle) ? [mid(b.pt(L.leftKnee), b.pt(L.leftAnkle)), b.ok(L.leftFootIndex) ? b.pt(L.leftFootIndex) : b.pt(L.leftAnkle)] : null,
    radius: RADIUS_TORSO.foot,
  },
  {
    joint: L.rightAnkle,
    limb: "kick",
    surface: (b) =>
      b.ok(L.rightKnee, L.rightAnkle) ? [mid(b.pt(L.rightKnee), b.pt(L.rightAnkle)), b.ok(L.rightFootIndex) ? b.pt(L.rightFootIndex) : b.pt(L.rightAnkle)] : null,
    radius: RADIUS_TORSO.foot,
  },
];

/** 때리는 면(선분)과 상대 몸 덩어리들 사이의 가장 가까운 거리 */
function nearestContact(surface: [P, P], toolRadius: number, shapes: Shape[]): { d: number; at: P; region: TargetRegion } | null {
  let best: { d: number; at: P; region: TargetRegion } | null = null;
  const SAMPLES = 5;
  for (let k = 0; k < SAMPLES; k++) {
    const u = k / (SAMPLES - 1);
    const p = { x: surface[0].x + (surface[1].x - surface[0].x) * u, y: surface[0].y + (surface[1].y - surface[0].y) * u };
    for (const s of shapes) {
      const { d, at } = distanceToShape(p, s);
      const gap = d - toolRadius;
      if (!best || gap < best.d) best = { d: gap, at, region: s.region };
    }
  }
  return best;
}

// ─────────────────────────────────────────────
// 판정기
// ─────────────────────────────────────────────

interface Frame {
  t: number;
  people: TrackedPerson[];
}

/** 장면을 차례로 넣으면, 상대 몸에 닿은 펀치·킥을 찾아 돌려준다 */
export class ContactDetector {
  private frames: Frame[] = [];
  private lastHit = new Map<string, number>();

  constructor(private readonly aspect: number) {}

  reset() {
    this.frames = [];
    this.lastHit.clear();
  }

  /**
   * 장면 하나를 넣는다. 바로 앞 장면의 판정 결과(닿은 타격)를 돌려준다.
   * 영상을 뒤로 감으면 처음부터 다시 판정한다.
   */
  push(t: number, people: TrackedPerson[]): StrikeContact[] {
    const last = this.frames.at(-1);
    if (last && t < last.t) this.reset();
    if (last && t === last.t) this.frames.pop();
    this.frames.push({ t, people });
    if (this.frames.length > 3) this.frames.shift();
    if (this.frames.length < 3) return [];
    const [prev, cur, next] = this.frames;
    return this.judge(prev, cur, next);
  }

  private judge(prev: Frame, cur: Frame, next: Frame): StrikeContact[] {
    const dtIn = cur.t - prev.t;
    const dtOut = next.t - cur.t;
    if (dtIn <= 0 || dtOut <= 0) return [];
    const found: StrikeContact[] = [];

    for (const attacker of cur.people) {
      const opponent = cur.people.find((p) => p.slot !== attacker.slot);
      const aPrev = prev.people.find((p) => p.slot === attacker.slot);
      const aNext = next.people.find((p) => p.slot === attacker.slot);
      // 두 선수 모두 이번 장면에서 실제로 찾았어야 판정한다 (예측으로 그린 자세는 쓰지 않음)
      if (!opponent || !aPrev || !aNext || attacker.predicted || opponent.predicted || aPrev.predicted || aNext.predicted) continue;
      const bCur = readBody(attacker, this.aspect);
      const bPrev = readBody(aPrev, this.aspect);
      const bNext = readBody(aNext, this.aspect);
      const target = readBody(opponent, this.aspect);
      if (!bCur || !bPrev || !bNext || !target) continue;
      const shapes = bodyShapes(target);
      if (shapes.length === 0) continue;
      const metersPerUnit = TRUNK_LENGTH_M / bCur.torso;

      for (const tool of STRIKE_TOOLS) {
        const j = tool.joint;
        if (!bCur.ok(j) || !bPrev.ok(j) || !bNext.ok(j)) continue;
        // 1) 빠름: 자기 몸(엉덩이 가운데) 기준 속도
        const vIn = {
          x: (bCur.pt(j).x - bPrev.pt(j).x - (bCur.hip.x - bPrev.hip.x)) / dtIn,
          y: (bCur.pt(j).y - bPrev.pt(j).y - (bCur.hip.y - bPrev.hip.y)) / dtIn,
        };
        const speedIn = norm(vIn);
        const speedMps = speedIn * metersPerUnit;
        if (speedMps < MIN_STRIKE_SPEED_MPS) continue;
        const dir = { x: vIn.x / speedIn, y: vIn.y / speedIn };

        // 3) 닿음: 때리는 면이 상대 몸 테두리에 닿았나
        const surface = tool.surface(bCur);
        if (!surface) continue;
        const contact = nearestContact(surface, tool.radius * bCur.torso, shapes);
        if (!contact || contact.d > CONTACT_GAP_TORSO * bCur.torso) continue;

        // 2) 향함: 직전 위치에서 닿은 곳 쪽으로 움직였나
        const toTarget = sub(contact.at, bPrev.pt(j));
        const toTargetLen = norm(toTarget);
        if (toTargetLen > 0 && dot(dir, toTarget) / toTargetLen < MIN_APPROACH_COS) continue;

        // 4) 멈춤: 다음 장면에서 같은 방향으로 계속 크게 나아가면 스친 것
        const vOut = {
          x: (bNext.pt(j).x - bCur.pt(j).x - (bNext.hip.x - bCur.hip.x)) / dtOut,
          y: (bNext.pt(j).y - bCur.pt(j).y - (bNext.hip.y - bCur.hip.y)) / dtOut,
        };
        if (dot(vOut, dir) > MAX_FOLLOW_THROUGH * speedIn) continue;

        // 같은 타격이 연달아 판정되면 하나로
        const key = `${attacker.slot}-${j}`;
        const lastT = this.lastHit.get(key);
        if (lastT !== undefined && cur.t - lastT < SAME_STRIKE_SEC) continue;
        this.lastHit.set(key, cur.t);

        const p = attacker.image[j];
        found.push({
          slot: attacker.slot,
          limb: tool.limb,
          joint: j,
          t: cur.t,
          x: p.x,
          y: p.y,
          dirX: dir.x,
          dirY: dir.y,
          strength: Math.min(1, speedMps / FULL_STRENGTH_SPEED_MPS),
          region: contact.region,
          outcome: contact.region === "arm" ? "blocked" : "hit",
        });
      }
    }
    return found;
  }
}
