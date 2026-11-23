// 키(뼈 길이) 일정하게 유지하기 검사
import { describe, expect, it } from "vitest";
import type { PoseLandmark } from "../types";
import { LANDMARK as L, LANDMARK_COUNT } from "./landmarks";
import { CALIBRATION_SAMPLES, legTrunkToStatureRatio, SkeletonNormalizer } from "./bodyLengths";
import type { TrackedPerson } from "./poseTracker";

const FRAME = 1 / 30;

/** 곧게 선 사람. k = 전체 크기 배율 (관절 찾기 도구가 장면마다 다르게 어림하는 상황 흉내) */
function person(k = 1, edit?: (w: Record<number, [number, number, number]>) => void): TrackedPerson {
  const w: Record<number, [number, number, number]> = {
    [L.nose]: [0, -0.72, -0.08],
    [L.leftShoulder]: [0.18, -0.5, 0],
    [L.rightShoulder]: [-0.18, -0.5, 0],
    [L.leftElbow]: [0.2, -0.22, 0],
    [L.rightElbow]: [-0.2, -0.22, 0],
    [L.leftWrist]: [0.2, 0.03, 0],
    [L.rightWrist]: [-0.2, 0.03, 0],
    [L.leftHip]: [0.1, 0, 0],
    [L.rightHip]: [-0.1, 0, 0],
    [L.leftKnee]: [0.1, 0.42, 0],
    [L.rightKnee]: [-0.1, 0.42, 0],
    [L.leftAnkle]: [0.1, 0.84, 0],
    [L.rightAnkle]: [-0.1, 0.84, 0],
    [L.leftHeel]: [0.1, 0.88, 0.05],
    [L.rightHeel]: [-0.1, 0.88, 0.05],
    [L.leftFootIndex]: [0.1, 0.9, -0.12],
    [L.rightFootIndex]: [-0.1, 0.9, -0.12],
  };
  edit?.(w);
  const world: PoseLandmark[] = [];
  const image: PoseLandmark[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const [x, y, z] = w[i] ?? [0, 0, 0];
    world.push({ x: x * k, y: y * k, z: z * k, visibility: 0.9 });
    image.push({ x: 0.5 + x * 0.3, y: 0.4 + y * 0.3, z: 0, visibility: 0.9 });
  }
  return { slot: 0, image, world, predicted: false, lostSec: 0, estimatedJoints: [] };
}

const dist = (p: PoseLandmark[], a: number, b: number) =>
  Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y, p[a].z - p[b].z);
const legTrunk = (p: PoseLandmark[]) =>
  dist(p, L.leftHip, L.leftKnee) +
  dist(p, L.leftKnee, L.leftAnkle) +
  Math.hypot(0, (p[L.leftShoulder].y + p[L.rightShoulder].y) / 2 - (p[L.leftHip].y + p[L.rightHip].y) / 2);

describe("키(뼈 길이) 일정하게 유지하기", () => {
  it("처음 1초 동안 잰 길이를 고정해, 그 뒤 크기가 다르게 어림돼도 키가 바뀌지 않는다", () => {
    const n = new SkeletonNormalizer();
    for (let i = 0; i < CALIBRATION_SAMPLES; i++) n.apply([person(1)], i * FRAME);
    const big = n.apply([person(1.2)], 2)[0].world; // 도구가 20% 크게 어림한 장면
    const small = n.apply([person(0.85)], 2 + FRAME)[0].world; // 15% 작게 어림한 장면
    expect(legTrunk(big)).toBeCloseTo(legTrunk(person(1).world), 6);
    expect(legTrunk(small)).toBeCloseTo(legTrunk(person(1).world), 6);
  });

  it("한 장면에서 팔이 늘어나 보여도 고정한 길이로 되돌리고, 방향은 그대로 둔다", () => {
    const n = new SkeletonNormalizer();
    for (let i = 0; i < CALIBRATION_SAMPLES; i++) n.apply([person(1)], i * FRAME);
    const forearm = dist(person(1).world, L.leftElbow, L.leftWrist);
    // 팔을 앞으로 뻗었는데 아래팔이 2배로 늘어난 것처럼 나온 장면
    const out = n.apply([person(1, (w) => (w[L.leftWrist] = [0.2, -0.22, -0.5]))], 2)[0].world;
    expect(dist(out, L.leftElbow, L.leftWrist)).toBeCloseTo(forearm, 6);
    expect(out[L.leftWrist].z).toBeLessThan(out[L.leftElbow].z - forearm * 0.99); // 여전히 앞(카메라 쪽)을 향함
  });

  it("키를 입력하면 그 키에 맞는 크기로 세운다 (de Leva 비율)", () => {
    const n = new SkeletonNormalizer();
    n.setHeightCm(0, 180);
    let out = person(1).world;
    for (let i = 0; i <= CALIBRATION_SAMPLES; i++) out = n.apply([person(1)], i * FRAME)[0].world;
    expect(legTrunk(out)).toBeCloseTo(1.8 * legTrunkToStatureRatio(), 6);
  });

  it("(허벅지 + 정강이 + 몸통) ÷ 키 비율은 de Leva 표에서 약 0.78", () => {
    expect(legTrunkToStatureRatio()).toBeGreaterThan(0.76);
    expect(legTrunkToStatureRatio()).toBeLessThan(0.8);
  });
});
