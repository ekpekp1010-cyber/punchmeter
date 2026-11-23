// 원근(깊이) 배치 검사: 핀홀 카메라로 직접 찍은 것처럼 만든 선수에서 카메라까지 거리를 되찾는지
import { describe, expect, it } from "vitest";
import type { PoseLandmark } from "../types";
import { LANDMARK as L, LANDMARK_COUNT } from "./landmarks";
import { focalInScreenHeights, placeInCamera, verticalFovDeg } from "./cameraModel";

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
