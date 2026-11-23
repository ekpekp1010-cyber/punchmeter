// Design Ref: §5.1 진행 방향 화살표 — 펀치(손목)·킥(발목)이 빠르게 움직일 때, 그 순간 힘이 향하는 방향을 화살표로 보여 준다.
// 방향 = 주먹·발이 "몸(엉덩이 가운데) 기준으로" 움직이는 방향.
// 몸 기준으로 재면 카메라가 돌거나 선수가 통째로 스텝을 밟는 움직임이 빠져, 팔다리를 뻗는 움직임만 남는다.
// 그림용이다. 속도·힘 숫자는 PLAN 작업 13에서 오차 범위와 함께 따로 계산한다.

import type { PoseLandmark } from "../types";
import { segmentParam } from "../physics/body";
import { STRIKE_BENCHMARKS } from "../reference/strikes";
import { LANDMARK as L } from "./landmarks";
import type { TrackedPerson } from "./poseTracker";

export type StrikeLimb = "punch" | "kick";

export interface StrikeArrow {
  slot: number;
  limb: StrikeLimb;
  /** 관절 번호 (왼·오른 손목, 왼·오른 발목) */
  joint: number;
  /** 화살표 시작점 = 주먹·발 위치 (화면 비율 0~1) */
  x: number;
  y: number;
  /** 진행 방향 (단위 벡터, 화면 높이 기준. x는 화면 가로 비율로 보정됨) */
  dirX: number;
  dirY: number;
  /** 화살표 세기 0~1 (공개 기록의 펀치 속도에 닿으면 1) */
  strength: number;
}

/** 화살표로 보여 줄 관절 */
const STRIKE_JOINTS: { joint: number; limb: StrikeLimb }[] = [
  { joint: L.leftWrist, limb: "punch" },
  { joint: L.rightWrist, limb: "punch" },
  { joint: L.leftAnkle, limb: "kick" },
  { joint: L.rightAnkle, limb: "kick" },
];

/** 이보다 잘 보이는 관절만 쓴다 */
const MIN_VISIBILITY = 0.5;

/** 몸통 길이(m): de Leva 1996 남녀 평균. 화면 속 몸통 길이를 m로 어림하는 기준 */
export const TRUNK_LENGTH_M = (() => {
  const { lengthMm } = segmentParam("trunk");
  return (lengthMm.male + lengthMm.female) / 2 / 1000;
})();

/**
 * 화살표를 보여 주기 시작하는 속도 (m/s, 그림용 설정값).
 * 가드를 고쳐 잡거나 자세를 바꾸는 느린 움직임에는 화살표를 그리지 않기 위한 값이다 (측정 기준값 아님, 영상 시험 후 조정).
 */
export const ARROW_MIN_SPEED_MPS = 2;

/** 화살표가 가장 굵고 길어지는 속도 (m/s): 공개 자료의 올림픽 복서 스트레이트 펀치 속도 (Walilko 2005) */
export const ARROW_FULL_SPEED_MPS = STRIKE_BENCHMARKS.find((b) => b.strike === "straightPunch" && b.measure === "velocity")!
  .value as number;

const mid = (a: PoseLandmark, b: PoseLandmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 화면 속 몸통 길이 (화면 높이 단위) */
function torsoLength(image: PoseLandmark[], aspect: number): number | null {
  const s = mid(image[L.leftShoulder], image[L.rightShoulder]);
  const h = mid(image[L.leftHip], image[L.rightHip]);
  const len = Math.hypot((s.x - h.x) * aspect, s.y - h.y);
  return len > 0.01 ? len : null;
}

/**
 * 두 순간의 자세로 펀치·킥 화살표를 구한다.
 * @param now 지금 자세
 * @param before 조금 전 자세
 * @param dtSec 두 자세 사이 시간 (영상 속 초)
 * @param aspect 영상 가로÷세로
 */
export function strikeArrows(now: TrackedPerson[], before: TrackedPerson[], dtSec: number, aspect: number): StrikeArrow[] {
  if (dtSec <= 0) return [];
  const arrows: StrikeArrow[] = [];
  for (const person of now) {
    // 예측으로 보여 주는 선수는 자세가 멈춰 있어 화살표를 그리지 않는다
    if (person.predicted) continue;
    const prev = before.find((p) => p.slot === person.slot);
    if (!prev || prev.predicted) continue;
    const torso = torsoLength(person.image, aspect);
    if (!torso) continue;
    const metersPerUnit = TRUNK_LENGTH_M / torso;

    // 몸(엉덩이 가운데)의 움직임
    const hipNow = mid(person.image[L.leftHip], person.image[L.rightHip]);
    const hipPrev = mid(prev.image[L.leftHip], prev.image[L.rightHip]);
    const hipVx = ((hipNow.x - hipPrev.x) * aspect) / dtSec;
    const hipVy = (hipNow.y - hipPrev.y) / dtSec;

    const estimated = new Set([...person.estimatedJoints, ...prev.estimatedJoints]);
    for (const { joint, limb } of STRIKE_JOINTS) {
      const p = person.image[joint];
      const q = prev.image[joint];
      if (!p || !q || estimated.has(joint)) continue;
      if (p.visibility < MIN_VISIBILITY || q.visibility < MIN_VISIBILITY) continue;
      // 몸 기준 속도 (화면 높이/초)
      const vx = ((p.x - q.x) * aspect) / dtSec - hipVx;
      const vy = (p.y - q.y) / dtSec - hipVy;
      const speedUnits = Math.hypot(vx, vy);
      const speedMps = speedUnits * metersPerUnit;
      if (speedMps < ARROW_MIN_SPEED_MPS) continue;
      arrows.push({
        slot: person.slot,
        limb,
        joint,
        x: p.x,
        y: p.y,
        dirX: vx / speedUnits,
        dirY: vy / speedUnits,
        strength: Math.min(1, speedMps / ARROW_FULL_SPEED_MPS),
      });
    }
  }
  return arrows;
}
