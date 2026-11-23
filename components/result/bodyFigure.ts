// Design Ref: §5.1 화면 구성 — 분석 시뮬레이션 칸에 관절 점이 아니라 사람 형체를 그린다
// 부위마다 BodyPart 이름을 붙여 두었으므로, PLAN 작업 18(누적 충격 색칠)에서 colorOf로 부위별 색을 바꿀 수 있다.

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { LANDMARK as L, PoseLandmarker } from "@/lib/engine/poseLandmarker";
import type { BodyPart } from "@/lib/types";

/** 관절 하나, 또는 두 관절의 가운데 */
type Anchor = number | readonly [number, number];

interface LimbShape {
  part: BodyPart | null;
  from: Anchor;
  to: Anchor;
  /** 굵기 = 몸통 길이(어깨 가운데~엉덩이 가운데) × 이 비율 */
  width: number;
}

interface ScreenPoint {
  x: number;
  y: number;
  /** 카메라에서 먼 정도 (클수록 멀다) */
  z: number;
  visibility: number;
}

export interface FigureOptions {
  /** 부위별 색을 정한다. undefined를 돌려주면 기본 색을 쓴다 (작업 18 누적 색칠용) */
  colorOf?: (part: BodyPart | null) => string | undefined;
}

/** 한쪽(왼쪽/오른쪽) 팔다리. 굵기 비율은 보통 체형 기준의 눈대중 값 (그림용, 계산에 쓰지 않음) */
function sideLimbs(side: "left" | "right"): LimbShape[] {
  const left = side === "left";
  return [
    { part: left ? "upperArmLeft" : "upperArmRight", from: left ? L.leftShoulder : L.rightShoulder, to: left ? L.leftElbow : L.rightElbow, width: 0.21 },
    { part: left ? "forearmLeft" : "forearmRight", from: left ? L.leftElbow : L.rightElbow, to: left ? L.leftWrist : L.rightWrist, width: 0.17 },
    { part: null, from: left ? L.leftWrist : L.rightWrist, to: left ? [L.leftPinky, L.leftIndex] : [L.rightPinky, L.rightIndex], width: 0.17 },
    { part: left ? "thighLeft" : "thighRight", from: left ? L.leftHip : L.rightHip, to: left ? L.leftKnee : L.rightKnee, width: 0.32 },
    { part: left ? "lowerLegLeft" : "lowerLegRight", from: left ? L.leftKnee : L.rightKnee, to: left ? L.leftAnkle : L.rightAnkle, width: 0.23 },
    { part: null, from: left ? L.leftAnkle : L.rightAnkle, to: left ? L.leftFootIndex : L.rightFootIndex, width: 0.14 },
  ];
}

function at(person: NormalizedLandmark[], anchor: Anchor, w: number, h: number): ScreenPoint | null {
  const list = typeof anchor === "number" ? [person[anchor]] : [person[anchor[0]], person[anchor[1]]];
  if (list.some((p) => !p)) return null;
  const n = list.length;
  return {
    x: (list.reduce((s, p) => s + p.x, 0) / n) * w,
    y: (list.reduce((s, p) => s + p.y, 0) / n) * h,
    z: list.reduce((s, p) => s + p.z, 0) / n,
    visibility: Math.min(...list.map((p) => p.visibility ?? 0)),
  };
}

/** 색을 어둡게 (#rrggbb, 0~1 비율만큼 검정과 섞음) */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const k = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

/** 잘 안 보이는 부위는 흐리게 */
const alphaOf = (visibility: number) => 0.35 + 0.65 * visibility;

/**
 * 사람 한 명을 형체(머리·몸통·팔다리 덩어리)로 그린다.
 * 카메라에서 먼 쪽 팔다리 → 몸통·머리 → 가까운 쪽 팔다리 순서로 그려 앞뒤가 보이게 한다.
 */
export function drawBodyFigure(
  ctx: CanvasRenderingContext2D,
  person: NormalizedLandmark[],
  width: number,
  height: number,
  baseColor: string,
  options: FigureOptions = {},
): void {
  const ls = at(person, L.leftShoulder, width, height);
  const rs = at(person, L.rightShoulder, width, height);
  const lh = at(person, L.leftHip, width, height);
  const rh = at(person, L.rightHip, width, height);
  if (!ls || !rs || !lh || !rh) return;

  const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  // 몸통 길이를 몸 크기의 기준으로 쓴다 (옆으로 서도 어깨 너비보다 덜 변함)
  const torsoLen = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);
  if (torsoLen < 4) return;
  const outlineW = Math.max(1.5, torsoLen * 0.025);

  const colorFor = (part: BodyPart | null, far: boolean) => {
    const c = options.colorOf?.(part) ?? baseColor;
    return far && c.startsWith("#") ? shade(c, 0.35) : c;
  };
  const outlineColor = shade(baseColor, 0.65);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const drawLimbs = (limbs: LimbShape[], far: boolean) => {
    const segments = limbs
      .map((limb) => ({ limb, a: at(person, limb.from, width, height), b: at(person, limb.to, width, height) }))
      .filter((s): s is { limb: LimbShape; a: ScreenPoint; b: ScreenPoint } => s.a !== null && s.b !== null);
    // 테두리를 먼저 모두 그리고 속을 칠해야 관절 이음매가 자연스럽다
    for (const pass of ["outline", "fill"] as const) {
      for (const { limb, a, b } of segments) {
        ctx.globalAlpha = alphaOf(Math.min(a.visibility, b.visibility));
        ctx.strokeStyle = pass === "outline" ? outlineColor : colorFor(limb.part, far);
        ctx.lineWidth = limb.width * torsoLen + (pass === "outline" ? outlineW * 2 : 0);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  };

  // z가 클수록 카메라에서 멀다
  const leftIsFar = (ls.z + lh.z) / 2 > (rs.z + rh.z) / 2;
  drawLimbs(sideLimbs(leftIsFar ? "left" : "right"), true);

  // 목
  const earL = at(person, L.leftEar, width, height);
  const earR = at(person, L.rightEar, width, height);
  const headCenter = earL && earR ? { x: (earL.x + earR.x) / 2, y: (earL.y + earR.y) / 2 } : null;
  if (headCenter) {
    ctx.globalAlpha = alphaOf(Math.min(earL!.visibility, earR!.visibility));
    for (const pass of ["outline", "fill"] as const) {
      ctx.strokeStyle = pass === "outline" ? outlineColor : colorFor(null, false);
      ctx.lineWidth = torsoLen * 0.2 + (pass === "outline" ? outlineW * 2 : 0);
      ctx.beginPath();
      ctx.moveTo(shoulderMid.x, shoulderMid.y);
      ctx.lineTo(headCenter.x, headCenter.y);
      ctx.stroke();
    }
  }

  // 몸통: 어깨·엉덩이 네 점을 잇고 두꺼운 둥근 선으로 감싸 덩어리처럼 보이게 한다
  const torso = [ls, rs, rh, lh];
  const torsoPath = () => {
    ctx.beginPath();
    ctx.moveTo(torso[0].x, torso[0].y);
    for (const p of torso.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
  };
  const torsoRound = torsoLen * 0.18;
  ctx.globalAlpha = alphaOf(Math.min(...torso.map((p) => p.visibility)));
  torsoPath();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = torsoRound + outlineW * 2;
  ctx.stroke();
  ctx.fillStyle = colorFor("torsoFront", false);
  ctx.strokeStyle = colorFor("torsoFront", false);
  ctx.lineWidth = torsoRound;
  ctx.fill();
  ctx.stroke();

  // 머리: 두 귀 가운데를 중심으로 한 원, 코 쪽에 작은 점(얼굴 방향)
  if (headCenter) {
    const earDist = Math.hypot(earL!.x - earR!.x, earL!.y - earR!.y);
    const radius = Math.max(earDist * 0.6, torsoLen * 0.2);
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = colorFor("head", false);
    ctx.fill();
    ctx.lineWidth = outlineW;
    ctx.strokeStyle = outlineColor;
    ctx.stroke();
    const nose = at(person, L.nose, width, height);
    if (nose) {
      ctx.beginPath();
      ctx.arc(nose.x, nose.y, Math.max(2, radius * 0.15), 0, Math.PI * 2);
      ctx.fillStyle = outlineColor;
      ctx.fill();
    }
  }

  drawLimbs(sideLimbs(leftIsFar ? "right" : "left"), false);
  ctx.restore();
}

/** 관절 점과 연결선만 그린다 (비교·점검용) */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  person: NormalizedLandmark[],
  width: number,
  height: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, width / 300);
  for (const { start: a, end: b } of PoseLandmarker.POSE_CONNECTIONS) {
    const p = person[a];
    const q = person[b];
    if (!p || !q) continue;
    ctx.beginPath();
    ctx.moveTo(p.x * width, p.y * height);
    ctx.lineTo(q.x * width, q.y * height);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  for (const point of person) {
    ctx.globalAlpha = alphaOf(point.visibility ?? 0);
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, Math.max(3, width / 200), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
