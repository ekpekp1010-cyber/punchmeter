// 원근(깊이) 배치 검사: 핀홀 카메라로 직접 찍은 것처럼 만든 선수에서 카메라까지 거리를 되찾는지
import { describe, expect, it } from "vitest";
import type { PoseLandmark } from "../types";
import { LANDMARK as L, LANDMARK_COUNT } from "./landmarks";
import {
  CameraPlacer,
  composeInCamera,
  CompositionPlacer,
  focalInScreenHeights,
  MAX_BODY_ACCEL_MPS2,
  MAX_BODY_SPEED_MPS,
  placeInCamera,
  START_WINDOW_SEC,
  verticalFovDeg,
} from "./cameraModel";
import type { TrackedPerson } from "./poseTracker";

const ASPECT = 16 / 9;
const FOCAL = focalInScreenHeights(26, ASPECT); // 휴대폰 기본 카메라

/** 엉덩이 원점 3D 관절 (m, y 아래가 +) */
function body(lean = 0): Record<number, [number, number, number]> {
  // lean: 상체를 카메라 쪽으로 숙인 정도 (어깨가 앞으로 나온 거리, m)
  return {
    [L.leftShoulder]: [0.18, -0.5, -lean],
    [L.rightShoulder]: [-0.18, -0.5, -lean],
    [L.leftElbow]: [0.22, -0.22, -lean],
    [L.rightElbow]: [-0.22, -0.22, -lean],
    [L.leftWrist]: [0.2, 0.02, -lean],
    [L.rightWrist]: [-0.2, 0.02, -lean],
    [L.leftHip]: [0.1, 0, 0],
    [L.rightHip]: [-0.1, 0, 0],
    [L.leftKnee]: [0.11, 0.42, 0],
    [L.rightKnee]: [-0.11, 0.42, 0],
    [L.leftAnkle]: [0.12, 0.84, 0],
    [L.rightAnkle]: [-0.12, 0.84, 0],
  };
}

/** 카메라 앞 (x, y, z) m에 선 사람을 핀홀 카메라로 찍는다 */
function shoot(hip: [number, number, number], lean = 0) {
  const b = body(lean);
  const image: PoseLandmark[] = [];
  const world: PoseLandmark[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const [x, y, z] = b[i] ?? [0, 0, 0];
    world.push({ x, y, z, visibility: 0.9 });
    const X = hip[0] + x;
    const Y = hip[1] + y;
    const Z = hip[2] + z;
    image.push({ x: 0.5 + (X * FOCAL) / Z / ASPECT, y: 0.5 + (Y * FOCAL) / Z, z: 0, visibility: 0.9 });
  }
  return { image, world };
}

describe("원근으로 선수 깊이 구하기", () => {
  it("휴대폰 기본 카메라(26mm 환산)의 세로 화각은 약 42°", () => {
    expect(verticalFovDeg(FOCAL)).toBeGreaterThan(40);
    expect(verticalFovDeg(FOCAL)).toBeLessThan(45);
  });

  it("카메라에서 3 m 떨어진 선수의 위치를 되찾는다 (5% 이내)", () => {
    const { image, world } = shoot([0.4, 0.2, 3]);
    const p = placeInCamera(image, world, ASPECT, FOCAL)!;
    expect(p.z).toBeGreaterThan(3 * 0.95);
    expect(p.z).toBeLessThan(3 * 1.05);
    expect(p.x).toBeCloseTo(0.4, 1);
    expect(p.y).toBeCloseTo(0.2, 1);
  });

  it("멀리 있어 작게 보이는 선수는 그만큼 뒤에 세운다", () => {
    const near = shoot([-0.5, 0.2, 2.5]);
    const far = shoot([0.6, 0.2, 5]);
    const zNear = placeInCamera(near.image, near.world, ASPECT, FOCAL)!.z;
    const zFar = placeInCamera(far.image, far.world, ASPECT, FOCAL)!.z;
    expect(zFar / zNear).toBeGreaterThan(1.9);
    expect(zFar / zNear).toBeLessThan(2.1);
  });

  it("상체를 카메라 쪽으로 숙여 몸통이 짧아 보여도 거리를 크게 틀리지 않는다", () => {
    const { image, world } = shoot([0, 0.2, 3], 0.3);
    const p = placeInCamera(image, world, ASPECT, FOCAL)!;
    expect(p.z).toBeGreaterThan(3 * 0.9);
    expect(p.z).toBeLessThan(3 * 1.1);
  });

  it("믿을 만한 관절이 없으면 어림하지 않는다", () => {
    const { image, world } = shoot([0, 0, 3]);
    const hidden = image.map((p) => ({ ...p, visibility: 0.1 }));
    expect(placeInCamera(hidden, world, ASPECT, FOCAL)).toBeNull();
  });
});

describe("물리적으로 가능한 움직임만 허용", () => {
  const FRAME = 1 / 30;
  const tracked = (hip: [number, number, number]): TrackedPerson => ({
    slot: 0,
    ...shoot(hip),
    predicted: false,
    lostSec: 0,
    estimatedJoints: [],
  });
  const depthOf = (out: TrackedPerson[]) => out[0].camera!.z;

  it("처음 0.5초의 가운데 값으로 시작 위치를 정해, 그 사이 한 장면이 튀어도 흔들리지 않는다", () => {
    const placer = new CameraPlacer();
    let z = 0;
    for (let i = 0; i * FRAME <= START_WINDOW_SEC + FRAME; i++) {
      const hip: [number, number, number] = i === 5 ? [0, 0.2, 8] : [0, 0.2, 3]; // 6번째 장면만 8 m로 튐
      z = depthOf(placer.apply([tracked(hip)], i * FRAME, ASPECT, FOCAL));
    }
    expect(z).toBeGreaterThan(2.85);
    expect(z).toBeLessThan(3.15);
  });

  it("어림값이 갑자기 3 m 뒤로 튀어도 순간이동하지 않고, 속도·가속도 한계 안에서만 움직인다", () => {
    const placer = new CameraPlacer();
    let t = 0;
    for (; t <= START_WINDOW_SEC + FRAME; t += FRAME) placer.apply([tracked([0, 0.2, 3])], t, ASPECT, FOCAL);
    const zs: number[] = [];
    for (let i = 0; i < 60; i++, t += FRAME) zs.push(depthOf(placer.apply([tracked([0, 0.2, 6])], t, ASPECT, FOCAL)));
    const speeds = zs.slice(1).map((z, i) => (z - zs[i]) / FRAME);
    const accels = speeds.slice(1).map((v, i) => Math.abs(v - speeds[i]) / FRAME);
    expect(Math.max(...speeds.map(Math.abs))).toBeLessThanOrEqual(MAX_BODY_SPEED_MPS + 1e-6);
    expect(Math.max(...accels)).toBeLessThanOrEqual(MAX_BODY_ACCEL_MPS2 + 1e-6);
    // 한 장면 사이 이동은 5 m/s × 1/30초 ≈ 0.17 m를 넘지 않는다
    expect(zs[0] - 3).toBeLessThan(0.17);
    // 계속 그 자리면 결국 따라간다 (2초 뒤)
    expect(zs.at(-1)!).toBeGreaterThan(5.7);
  });

  it("한두 장면만 튀는 값은 무시한다 (최근 5장면 가운데 값)", () => {
    const placer = new CameraPlacer();
    let t = 0;
    for (; t <= START_WINDOW_SEC + FRAME; t += FRAME) placer.apply([tracked([0, 0.2, 3])], t, ASPECT, FOCAL);
    let max = 0;
    for (let i = 0; i < 30; i++, t += FRAME) {
      const hip: [number, number, number] = i === 3 || i === 4 ? [0, 0.2, 9] : [0, 0.2, 3];
      max = Math.max(max, depthOf(placer.apply([tracked(hip)], t, ASPECT, FOCAL)));
    }
    expect(max).toBeLessThan(3.05);
  });
});

describe("영상 구도 따라가기", () => {
  it("카메라 공간에 놓은 관절을 다시 화면으로 비추면 영상 속 위치와 정확히 같다 (깊이를 얼마로 어림하든)", () => {
    const { image, world } = shoot([0.3, 0.2, 3]);
    for (const depth of [2, 3, 7]) {
      const joints = composeInCamera(image, world, ASPECT, FOCAL, depth);
      for (const i of [L.leftWrist, L.rightAnkle, L.leftShoulder, L.rightHip]) {
        expect(0.5 + (joints[i].x * FOCAL) / joints[i].z / ASPECT).toBeCloseTo(image[i].x, 9);
        expect(0.5 + (joints[i].y * FOCAL) / joints[i].z).toBeCloseTo(image[i].y, 9);
      }
    }
  });

  it("관절의 앞뒤 차이(3D 관절의 z)는 유지한다", () => {
    const { image, world } = shoot([0, 0.2, 3], 0.3); // 상체를 0.3 m 앞으로 숙임
    const joints = composeInCamera(image, world, ASPECT, FOCAL, 3);
    expect(joints[L.leftHip].z - joints[L.leftShoulder].z).toBeCloseTo(0.3, 9);
  });

  it("카메라가 따라 움직여 선수가 화면에서 크게 이동해도, 모델은 영상과 같은 자리로 바로 옮겨 간다", () => {
    const composer = new CompositionPlacer();
    const FRAME = 1 / 30;
    const at = (hip: [number, number, number]): TrackedPerson => ({ slot: 0, ...shoot(hip), predicted: false, lostSec: 0, estimatedJoints: [] });
    composer.apply([at([-0.8, 0.2, 3])], 0, ASPECT, FOCAL);
    const out = composer.apply([at([0.8, 0.2, 3])], FRAME, ASPECT, FOCAL)[0];
    const j = out.cameraJoints!;
    const hipX = 0.5 + ((j[L.leftHip].x + j[L.rightHip].x) / 2 / ((j[L.leftHip].z + j[L.rightHip].z) / 2)) * (FOCAL / ASPECT);
    expect(hipX).toBeCloseTo((out.image[L.leftHip].x + out.image[L.rightHip].x) / 2, 6);
  });
});
