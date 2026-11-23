// 펀치·킥 진행 방향 화살표 검사
import { describe, expect, it } from "vitest";
import type { PoseLandmark } from "../types";
import { LANDMARK as L, LANDMARK_COUNT } from "./landmarks";
import { ARROW_FULL_SPEED_MPS, strikeArrows, TRUNK_LENGTH_M } from "./strikeArrows";
import type { TrackedPerson } from "./poseTracker";

const ASPECT = 16 / 9;
const FRAME = 1 / 30;
/** 화면 속 몸통 길이 (화면 높이 단위) → 1 화면 높이 = TRUNK_LENGTH_M / 0.2 m */
const TORSO = 0.2;
const M_PER_UNIT = TRUNK_LENGTH_M / TORSO;

/** 화면 속 사람. shift = 몸 전체 이동, wrist = 오른 손목 위치 */
function person(shiftX: number, wrist: [number, number], opts: { predicted?: boolean; visibility?: number } = {}): TrackedPerson {
  const pts: Record<number, [number, number]> = {
    [L.leftShoulder]: [0.48, 0.3],
    [L.rightShoulder]: [0.52, 0.3],
    [L.leftHip]: [0.49, 0.3 + TORSO],
    [L.rightHip]: [0.51, 0.3 + TORSO],
    [L.rightWrist]: wrist,
    [L.leftWrist]: [0.47, 0.35],
    [L.leftAnkle]: [0.49, 0.9],
    [L.rightAnkle]: [0.51, 0.9],
  };
  const image: PoseLandmark[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const [x, y] = pts[i] ?? [0.5, 0.5];
    const vis = i === L.rightWrist ? (opts.visibility ?? 0.9) : 0.9;
    image.push({ x: x + shiftX, y, z: 0, visibility: vis });
  }
  return { slot: 0, image, world: image, predicted: opts.predicted ?? false, lostSec: 0, estimatedJoints: [] };
}

/** 몸 기준 속도 v (m/s)로 오른손이 오른쪽으로 한 장면 동안 움직인 거리 (화면 가로 비율) */
const stepFor = (mps: number) => (mps * FRAME) / M_PER_UNIT / ASPECT;

describe("펀치·킥 진행 방향 화살표", () => {
  it("주먹이 빠르게 앞으로 나가면 그 방향으로 화살표를 그린다", () => {
    const before = person(0, [0.53, 0.35]);
    const now = person(0, [0.53 + stepFor(6), 0.35]);
    const arrows = strikeArrows([now], [before], FRAME, ASPECT);
    expect(arrows).toHaveLength(1);
    expect(arrows[0].limb).toBe("punch");
    expect(arrows[0].dirX).toBeCloseTo(1, 6);
    expect(arrows[0].dirY).toBeCloseTo(0, 6);
    expect(arrows[0].strength).toBeCloseTo(6 / ARROW_FULL_SPEED_MPS, 2);
  });

  it("가드를 고쳐 잡는 느린 움직임(2 m/s 미만)에는 화살표를 그리지 않는다", () => {
    const arrows = strikeArrows([person(0, [0.53 + stepFor(1.5), 0.35])], [person(0, [0.53, 0.35])], FRAME, ASPECT);
    expect(arrows).toHaveLength(0);
  });

  it("카메라가 돌거나 몸 전체가 옮겨 가는 움직임은 펀치로 보지 않는다 (몸 기준 속도)", () => {
    // 몸 전체(엉덩이·손목 모두)가 8 m/s만큼 한꺼번에 옮겨 감
    const shift = stepFor(8);
    const arrows = strikeArrows([person(shift, [0.53, 0.35])], [person(0, [0.53, 0.35])], FRAME, ASPECT);
    expect(arrows).toHaveLength(0);
  });

  it("공개 기록 펀치 속도(9.14 m/s) 이상이면 화살표 세기가 가장 크다", () => {
    const arrows = strikeArrows([person(0, [0.53 + stepFor(12), 0.35])], [person(0, [0.53, 0.35])], FRAME, ASPECT);
    expect(arrows[0].strength).toBe(1);
  });

  it("예측으로 보여 주는 선수, 잘 안 보이는 주먹에는 화살표를 그리지 않는다", () => {
    const moved: [number, number] = [0.53 + stepFor(6), 0.35];
    expect(strikeArrows([person(0, moved, { predicted: true })], [person(0, [0.53, 0.35])], FRAME, ASPECT)).toHaveLength(0);
    expect(strikeArrows([person(0, moved, { visibility: 0.2 })], [person(0, [0.53, 0.35])], FRAME, ASPECT)).toHaveLength(0);
  });
});
