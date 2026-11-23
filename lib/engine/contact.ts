// Design Ref: §3 데이터 흐름 ⑤ 접촉 판정 — PLAN 작업 10(접촉 판정)의 바탕을 앞당겨 만든다.
// PRD 원칙: 상대 몸(또는 샌드백·미트)에 닿은 경우만 타격으로 인정한다. 팔·글러브로 막힌 타격은 따로 센다.
//
// 장면이 들어올 때마다, 그 장면에서 "새로 닿은" 타격을 찾는다. 최근 몇 장면(약 0.13초)을 거꾸로 함께 본다.
// 아래를 모두 만족해야 "닿음"으로 본다.
//  1) 닿음: 주먹·정강이~발이 상대 몸의 테두리(머리·몸통·팔·다리 덩어리)에 닿았다
//  2) 새로: 바로 앞 장면에서는 닿아 있지 않았다 (가드를 붙이고 있거나 붙잡고 있는 것은 빠짐)
//  3) 다가옴: 최근 몇 장면 사이에 상대 몸 쪽으로 일정 거리 이상 다가왔다 (훅처럼 옆에서 들어와도 됨)
//  4) 빠름: 그 사이 가장 빠른 순간이 일정 속도 이상이었다. 속도는 자기 몸 기준이라 스텝·카메라 움직임은 빠진다
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
/**
 * 1) 닿기 전 최근 몇 장면 중 가장 빠른 순간이 이보다 빨라야 공격으로 본다 (m/s).
 * 닿기 직전에는 이미 느려지고, 카메라 쪽으로 뻗는 펀치는 화면에서 덜 움직여 보이므로 낮게 잡는다.
 */
export const MIN_STRIKE_SPEED_MPS = 1.5;
/** 2) 최근 몇 장면 사이에 상대 몸 쪽으로 이만큼(몸통 길이 비율) 이상 다가왔어야 한다 */
const MIN_APPROACH_TORSO = 0.15;
/** 3) 몸 테두리와 이 거리(몸통 길이 비율) 안이면 닿은 것으로 본다 */
const CONTACT_GAP_TORSO = 0.1;
/** 속도·다가옴을 볼 최근 장면 수 (30fps면 약 0.13초) */
const LOOKBACK_FRAMES = 4;
/** 같은 주먹·발의 판정이 이 시간(초) 안에 또 나오면 같은 타격으로 본다 */
const SAME_STRIKE_SEC = 0.3;
/**
 * 관절이 이보다 잘 보여야 판정에 쓴다.
 * 주먹이 상대 얼굴·몸에 닿는 순간에는 서로 겹쳐 잘 안 보이는 것으로 나오기 쉬워 낮게 잡는다.
 */
const MIN_VISIBILITY = 0.3;
/** 상대가 겹쳐서 잠깐 안 보여 예측 자세로 그리는 중이어도, 이 시간(초) 안이면 그 자세로 판정한다 */
const MAX_OPPONENT_LOST_SEC = 0.3;

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

/** 한 장면에서 공격자 주먹·발과 상대 몸 사이의 거리 (몸통 길이 비율). 잴 수 없으면 null */
interface Reach {
  gap: number;
  at: P;
  region: TargetRegion;
  joint: P;
  hip: P;
  torso: number;
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
   * 장면 하나를 넣고, 그 장면에서 상대 몸에 새로 닿은 타격을 돌려준다.
   * 떨림을 거르기 전의 자세를 넣어야 빠른 주먹이 덜 깎인다. 영상을 뒤로 감으면 처음부터 다시 판정한다.
   */
  push(t: number, people: TrackedPerson[]): StrikeContact[] {
    const last = this.frames.at(-1);
    if (last && t < last.t) this.reset();
    if (last && t === last.t) this.frames.pop();
    this.frames.push({ t, people });
    if (this.frames.length > LOOKBACK_FRAMES + 1) this.frames.shift();
    if (this.frames.length < 2) return [];
    return this.judge();
  }

  /** 공격자의 주먹·발(tool)과 상대 몸 사이 거리 */
  private reach(frame: Frame, slot: number, tool: StrikeTool): Reach | null {
    const attacker = frame.people.find((p) => p.slot === slot);
    const opponent = frame.people.find((p) => p.slot !== slot);
    if (!attacker || !opponent || attacker.predicted) return null;
    if (opponent.predicted && opponent.lostSec > MAX_OPPONENT_LOST_SEC) return null;
    const a = readBody(attacker, this.aspect);
    const b = readBody(opponent, this.aspect);
    if (!a || !b || !a.ok(tool.joint)) return null;
    const surface = tool.surface(a);
    const shapes = bodyShapes(b);
    if (!surface || shapes.length === 0) return null;
    const near = nearestContact(surface, tool.radius * a.torso, shapes);
    if (!near) return null;
    return { gap: near.d / a.torso, at: near.at, region: near.region, joint: a.pt(tool.joint), hip: a.hip, torso: a.torso };
  }

  private judge(): StrikeContact[] {
    const cur = this.frames.at(-1)!;
    const found: StrikeContact[] = [];
    for (const attacker of cur.people) {
      for (const tool of STRIKE_TOOLS) {
        // 3) 닿음: 이번 장면에서 상대 몸 테두리에 닿았다
        const now = this.reach(cur, attacker.slot, tool);
        if (!now || now.gap > CONTACT_GAP_TORSO) continue;
        // 바로 앞 장면에서 이미 닿아 있었으면 새 타격이 아니다 (가드를 상대에게 붙이고 있거나 클린치)
        const before = this.reach(this.frames.at(-2)!, attacker.slot, tool);
        if (before && before.gap <= CONTACT_GAP_TORSO) continue;

        // 최근 장면들을 거꾸로 보며 1) 가장 빠른 순간과 2) 얼마나 다가왔는지 구한다
        let maxSpeedMps = 0;
        let farthestGap = now.gap;
        let dir: P | null = null;
        let later = now;
        let laterT = cur.t;
        for (let k = this.frames.length - 2; k >= 0; k--) {
          const f = this.frames[k];
          const r = this.reach(f, attacker.slot, tool);
          if (!r) break;
          const dt = laterT - f.t;
          if (dt <= 0) break;
          // 자기 몸(엉덩이 가운데) 기준 속도: 스텝·몸 전체 이동·카메라 움직임은 빠진다
          const v = {
            x: (later.joint.x - r.joint.x - (later.hip.x - r.hip.x)) / dt,
            y: (later.joint.y - r.joint.y - (later.hip.y - r.hip.y)) / dt,
          };
          const speed = norm(v) * (TRUNK_LENGTH_M / later.torso);
          if (speed > maxSpeedMps) maxSpeedMps = speed;
          // 화살표 방향: 닿기 직전 두 칸의 평균 움직임
          if (k >= this.frames.length - 3) dir = dir ? { x: dir.x + v.x, y: dir.y + v.y } : v;
          farthestGap = Math.max(farthestGap, r.gap);
          later = r;
          laterT = f.t;
        }
        if (maxSpeedMps < MIN_STRIKE_SPEED_MPS) continue;
        if (farthestGap - now.gap < MIN_APPROACH_TORSO) continue;
        if (!dir || norm(dir) === 0) continue;

        // 같은 타격이 연달아 판정되면 하나로
        const key = `${attacker.slot}-${tool.joint}`;
        const lastT = this.lastHit.get(key);
        if (lastT !== undefined && cur.t - lastT < SAME_STRIKE_SEC) continue;
        this.lastHit.set(key, cur.t);

        const p = attacker.image[tool.joint];
        const len = norm(dir);
        found.push({
          slot: attacker.slot,
          limb: tool.limb,
          joint: tool.joint,
          t: cur.t,
          x: p.x,
          y: p.y,
          dirX: dir.x / len,
          dirY: dir.y / len,
          strength: Math.min(1, maxSpeedMps / FULL_STRENGTH_SPEED_MPS),
          region: now.region,
          outcome: now.region === "arm" ? "blocked" : "hit",
        });
      }
    }
    return found;
  }
}
