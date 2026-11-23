// 선수 추적기 검사: 겹쳐서 안 보여도 사라지지 않는지, 색이 바뀌지 않는지, 잘린 다리를 곧게 채우는지
import { describe, expect, it } from "vitest";
import type { PoseLandmark } from "../types";
import { LANDMARK as L, LANDMARK_COUNT } from "./landmarks";
import { ESTIMATED_VISIBILITY, PoseTracker, repairLegs, type PoseDetection } from "./poseTracker";

const ASPECT = 16 / 9;
/** 그림 배율: 1m = 화면 높이의 0.3 */
const SCALE = 0.3;

/** 3D 관절 위치 (m, 엉덩이 가운데가 원점, y는 아래가 +, 카메라 쪽이 -z) — 곧게 선 사람 */
function standingWorld(): Record<number, [number, number, number]> {
  return {
    [L.leftShoulder]: [0.18, -0.5, 0],
    [L.rightShoulder]: [-0.18, -0.5, 0],
    [L.leftHip]: [0.1, 0, 0],
    [L.rightHip]: [-0.1, 0, 0],
    [L.leftKnee]: [0.11, 0.42, 0],
    [L.rightKnee]: [-0.11, 0.42, 0],
    [L.leftAnkle]: [0.12, 0.84, 0],
    [L.rightAnkle]: [-0.12, 0.84, 0],
    [L.leftHeel]: [0.12, 0.88, 0.05],
    [L.rightHeel]: [-0.12, 0.88, 0.05],
    [L.leftFootIndex]: [0.13, 0.9, -0.12],
    [L.rightFootIndex]: [-0.13, 0.9, -0.12],
  };
}

/** 사람 한 명을 만든다. cx·cy = 화면 속 엉덩이 위치 (0~1) */
function person(
  cx: number,
  cy = 0.4,
  edit?: (world: Record<number, [number, number, number]>) => void,
  hidden: number[] = [],
  scale = SCALE,
): PoseDetection {
  const w = standingWorld();
  edit?.(w);
  const image: PoseLandmark[] = [];
  const world: PoseLandmark[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const [x, y, z] = w[i] ?? [0, 0, 0];
    world.push({ x, y, z, visibility: 0.9 });
    const out = hidden.includes(i);
    image.push({
      x: cx + (x * scale) / ASPECT,
      y: out ? 1.1 : cy + y * scale,
      z: z * scale,
      visibility: out ? 0.1 : 0.9,
      presence: out ? 0.05 : 0.95,
    });
  }
  return { image, world };
}

const hipX = (p: { image: PoseLandmark[] }) => (p.image[L.leftHip].x + p.image[L.rightHip].x) / 2;
const FRAME = 1 / 30;

describe("선수 추적", () => {
  it("찾은 순서가 바뀌어도 같은 선수는 같은 색(번호)을 유지한다", () => {
    const tracker = new PoseTracker(ASPECT);
    tracker.update([person(0.3), person(0.7)], 0);
    const out = tracker.update([person(0.71), person(0.31)], FRAME);
    expect(out.map((p) => p.slot)).toEqual([0, 1]);
    expect(hipX(out[0])).toBeCloseTo(0.31, 5);
    expect(hipX(out[1])).toBeCloseTo(0.71, 5);
  });

  it("겹쳐서 한 명만 찾아도 두 명 모두 남고, 못 찾은 선수는 '예측'으로 표시된다", () => {
    const tracker = new PoseTracker(ASPECT);
    tracker.update([person(0.45), person(0.55)], 0);
    const out = tracker.update([person(0.46)], FRAME);
    expect(out).toHaveLength(2);
    expect(out[0].predicted).toBe(false);
    expect(out[1].predicted).toBe(true);
  });

  it("아무도 못 찾은 장면에서도 두 명이 사라지지 않는다", () => {
    const tracker = new PoseTracker(ASPECT);
    tracker.update([person(0.3), person(0.7)], 0);
    const out = tracker.update([], FRAME);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.predicted)).toBe(true);
  });

  it("안 보이는 동안은 움직이던 방향으로 위치를 예측한다", () => {
    const tracker = new PoseTracker(ASPECT);
    tracker.update([person(0.3), person(0.7)], 0);
    tracker.update([person(0.31), person(0.7)], FRAME);
    tracker.update([person(0.32), person(0.7)], 2 * FRAME);
    const out = tracker.update([person(0.7)], 3 * FRAME);
    expect(out[0].predicted).toBe(true);
    expect(hipX(out[0])).toBeGreaterThan(0.32);
    expect(hipX(out[0])).toBeLessThan(0.34);
  });

  it("두 선수가 정해진 뒤 나타난 세 번째 사람(심판)은 무시한다", () => {
    const tracker = new PoseTracker(ASPECT);
    tracker.update([person(0.3), person(0.7)], 0);
    const out = tracker.update([person(0.3), person(0.95), person(0.7)], FRAME);
    expect(out).toHaveLength(2);
    expect(hipX(out[0])).toBeCloseTo(0.3, 5);
    expect(hipX(out[1])).toBeCloseTo(0.7, 5);
  });

  it("앞뒤로 떨어진 두 선수가 화면에서 엇갈려 지나가도, 몸 크기로 누가 누구인지 유지한다", () => {
    const tracker = new PoseTracker(ASPECT);
    // 빨강(0번): 카메라 가까이 → 크게 보임, 파랑(1번): 멀리 → 작게 보임
    tracker.update([person(0.48, 0.4, undefined, [], 0.36), person(0.52, 0.4, undefined, [], 0.2)], 0);
    // 다음 장면: 가까운 선수는 0.505로, 먼 선수는 0.495로 엇갈림 (위치만 보면 빨강이 0.495 쪽에 더 가깝다)
    const out = tracker.update([person(0.495, 0.4, undefined, [], 0.2), person(0.505, 0.4, undefined, [], 0.36)], FRAME);
    expect(hipX(out[0])).toBeCloseTo(0.505, 5);
    expect(hipX(out[1])).toBeCloseTo(0.495, 5);
  });

  it("영상을 뒤로 감으면 추적을 처음부터 다시 한다", () => {
    const tracker = new PoseTracker(ASPECT);
    tracker.update([person(0.3), person(0.7)], 5);
    const out = tracker.update([person(0.5)], 1);
    expect(out).toHaveLength(1);
    expect(out[0].predicted).toBe(false);
  });
});

describe("무릎 아래가 잘린 다리 채우기", () => {
  const cutJoints = [L.leftAnkle, L.leftHeel, L.leftFootIndex];
  /** 도구가 화면 밖 발목을 뒤로 굽은 위치로 지어낸 상황 */
  const bentGuess = (w: Record<number, [number, number, number]>) => {
    w[L.leftAnkle] = [0.11, 0.62, 0.38];
  };

  it("본 적이 없으면 무릎에서 곧게 아래로 편 다리로 채우고, 채운 관절을 표시한다", () => {
    const fixed = repairLegs(person(0.5, 0.4, bentGuess, cutJoints), new Map(), ASPECT);
    const knee = fixed.world[L.leftKnee];
    const ankle = fixed.world[L.leftAnkle];
    expect(ankle.x).toBeCloseTo(knee.x, 6);
    expect(ankle.z).toBeCloseTo(knee.z, 6);
    expect(ankle.y).toBeGreaterThan(knee.y + 0.3);
    expect(fixed.estimatedJoints).toEqual(expect.arrayContaining(cutJoints));
    expect(ankle.visibility).toBe(ESTIMATED_VISIBILITY);
    // 화면 위치도 무릎 바로 아래 (화면 밖으로 이어진다)
    expect(fixed.image[L.leftAnkle].x).toBeCloseTo(fixed.image[L.leftKnee].x, 6);
    expect(fixed.image[L.leftAnkle].y).toBeGreaterThan(fixed.image[L.leftKnee].y);
  });

  it("최근에 보였던 다리 모양이 있으면 그 모양으로 채운다", () => {
    const memory = new Map();
    // 먼저 정강이가 앞으로 기운 자세가 잘 보였다
    const lean = (w: Record<number, [number, number, number]>) => {
      w[L.leftAnkle] = [0.11, 0.8, -0.15];
    };
    repairLegs(person(0.5, 0.4, lean), memory, ASPECT);
    // 다음 장면에서 잘림 → 기억한 모양 (무릎→발목 = 0, 0.38, -0.15)
    const fixed = repairLegs(person(0.5, 0.4, bentGuess, cutJoints), memory, ASPECT);
    const knee = fixed.world[L.leftKnee];
    const ankle = fixed.world[L.leftAnkle];
    expect(ankle.y - knee.y).toBeCloseTo(0.38, 6);
    expect(ankle.z - knee.z).toBeCloseTo(-0.15, 6);
  });

  it("잘 보이는 다리는 건드리지 않는다", () => {
    const original = person(0.5);
    const fixed = repairLegs(original, new Map(), ASPECT);
    expect(fixed.estimatedJoints).toEqual([]);
    expect(fixed.world[L.leftAnkle]).toEqual(original.world[L.leftAnkle]);
  });
});
