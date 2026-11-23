// 접촉 판정 검사: 상대 몸에 닿은 펀치·킥만 찾는지
import { describe, expect, it } from "vitest";
import type { PoseLandmark } from "../types";
import { LANDMARK as L, LANDMARK_COUNT } from "./landmarks";
import { ContactDetector, type StrikeContact } from "./contact";
import type { TrackedPerson } from "./poseTracker";

const ASPECT = 16 / 9;
const FRAME = 1 / 30;

type Edit = Partial<Record<number, [number, number]>>;

/**
 * 화면 속 선수 한 명 (몸통 길이 = 화면 높이의 0.25).
 * A(0번)는 왼쪽(cx 0.35)에서 오른쪽을, B(1번)는 오른쪽(cx 0.65)에서 왼쪽을 본다.
 * 가드: 상대 쪽 손은 몸 앞(0.06 바깥), 반대 손은 몸 쪽.
 */
function fighter(slot: number, cx: number, edit: Edit = {}, vis: Partial<Record<number, number>> = {}): TrackedPerson {
  const toward = slot === 0 ? 1 : -1; // 상대가 있는 쪽
  const front = slot === 0 ? "right" : "left"; // 상대 쪽 팔다리
  const s = (side: "left" | "right") => (side === front ? toward : -toward);
  const pts: Record<number, [number, number]> = {
    [L.nose]: [cx + 0.01 * toward, 0.27],
    [L.leftEar]: [cx + 0.015 * s("left"), 0.27],
    [L.rightEar]: [cx + 0.015 * s("right"), 0.27],
    [L.leftShoulder]: [cx + 0.03 * s("left"), 0.35],
    [L.rightShoulder]: [cx + 0.03 * s("right"), 0.35],
    [L.leftElbow]: [cx + 0.05 * s("left"), 0.45],
    [L.rightElbow]: [cx + 0.05 * s("right"), 0.45],
    [L.leftWrist]: [cx + 0.06 * s("left"), 0.4],
    [L.rightWrist]: [cx + 0.06 * s("right"), 0.4],
    [L.leftHip]: [cx + 0.02 * s("left"), 0.6],
    [L.rightHip]: [cx + 0.02 * s("right"), 0.6],
    [L.leftKnee]: [cx + 0.02 * s("left"), 0.75],
    [L.rightKnee]: [cx + 0.02 * s("right"), 0.75],
    [L.leftAnkle]: [cx + 0.02 * s("left"), 0.9],
    [L.rightAnkle]: [cx + 0.02 * s("right"), 0.9],
  };
  Object.assign(pts, edit);
  // 손가락·발끝은 손목·발목 바로 옆 (상대 쪽으로 0.005)
  for (const [w, a, b] of [
    [L.leftWrist, L.leftPinky, L.leftIndex],
    [L.rightWrist, L.rightPinky, L.rightIndex],
    [L.leftAnkle, L.leftFootIndex, L.leftHeel],
    [L.rightAnkle, L.rightFootIndex, L.rightHeel],
  ] as const) {
    pts[a] = [pts[w][0] + 0.005 * toward, pts[w][1]];
    pts[b] = [pts[w][0] + 0.005 * toward, pts[w][1]];
  }
  const image: PoseLandmark[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const [x, y] = pts[i] ?? [cx, 0.5];
    image.push({ x, y, z: 0, visibility: vis[i] ?? 0.9 });
  }
  return { slot, image, world: image, predicted: false, lostSec: 0, estimatedJoints: [] };
}

interface AFrame {
  cx?: number;
  edit: Edit;
  /** A 관절별 보이는 정도 바꾸기 */
  vis?: Partial<Record<number, number>>;
  /** 이 장면에서 B가 겹쳐 안 보여 예측 자세인가 (안 보인 시간, 초) */
  bLostSec?: number;
}

/** A의 장면들을 차례로 넣고 찾은 타격을 모은다 (B는 제자리) */
function run(aFrames: AFrame[], bEdit: Edit = {}): StrikeContact[] {
  const detector = new ContactDetector(ASPECT);
  const found: StrikeContact[] = [];
  aFrames.forEach((f, i) => {
    const b = fighter(1, 0.65, bEdit);
    if (f.bLostSec !== undefined) Object.assign(b, { predicted: true, lostSec: f.bLostSec });
    found.push(...detector.push(i * FRAME, [fighter(0, f.cx ?? 0.35, f.edit, f.vis), b]));
  });
  return found;
}

const rightFist = (x: number, y: number): Edit => ({ [L.rightWrist]: [x, y] });

describe("상대 몸에 닿은 타격만 찾기", () => {
  it("상대 머리까지 뻗어 닿고 멈춘 펀치는 '펀치 · 머리'로 찾는다", () => {
    const found = run([
      { edit: rightFist(0.41, 0.28) },
      { edit: rightFist(0.5, 0.28) },
      { edit: rightFist(0.6, 0.28) }, // 닿음
      { edit: rightFist(0.59, 0.28) }, // 멈추고 살짝 되돌아옴
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slot: 0, limb: "punch", region: "head", outcome: "hit" });
    expect(found[0].t).toBeCloseTo(2 * FRAME, 9);
    expect(found[0].dirX).toBeGreaterThan(0.99); // 오른쪽(상대 쪽)으로
  });

  it("상대에게 닿기 전에 허공에서 멈춘 펀치(빠른 손동작)는 찾지 않는다", () => {
    const found = run([
      { edit: rightFist(0.41, 0.28) },
      { edit: rightFist(0.47, 0.28) },
      { edit: rightFist(0.52, 0.28) },
      { edit: rightFist(0.51, 0.28) },
    ]);
    expect(found).toHaveLength(0);
  });

  it("상대 머리 위로 지나가 닿지 않은 펀치는 찾지 않는다", () => {
    const found = run([
      { edit: rightFist(0.41, 0.12) },
      { edit: rightFist(0.5, 0.12) },
      { edit: rightFist(0.6, 0.12) },
      { edit: rightFist(0.7, 0.12) },
    ]);
    expect(found).toHaveLength(0);
  });

  it("몸 전체가 다가가 닿게 되는 스텝은 펀치로 보지 않는다 (주먹이 몸 기준으로 움직이지 않음)", () => {
    const step = (cx: number) => ({ cx, edit: rightFist(cx + 0.06, 0.28) });
    expect(run([step(0.35), step(0.43), step(0.51), step(0.54)])).toHaveLength(0);
  });

  it("옆에서 휘어 들어오는 훅도 머리에 닿으면 찾는다", () => {
    const found = run([
      { edit: rightFist(0.47, 0.45) },
      { edit: rightFist(0.52, 0.38) },
      { edit: rightFist(0.57, 0.31) },
      { edit: rightFist(0.61, 0.28) }, // 닿음
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ limb: "punch", region: "head", outcome: "hit" });
  });

  it("닿는 순간 주먹이 상대와 겹쳐 잘 안 보이는 것으로 나와도 찾는다", () => {
    const found = run([
      { edit: rightFist(0.41, 0.28) },
      { edit: rightFist(0.5, 0.28) },
      { edit: rightFist(0.6, 0.28), vis: { [L.rightWrist]: 0.35 } },
    ]);
    expect(found).toHaveLength(1);
  });

  it("닿는 순간 상대가 겹쳐 잠깐 예측 자세로 그려져도 찾는다", () => {
    const found = run([
      { edit: rightFist(0.41, 0.28) },
      { edit: rightFist(0.5, 0.28) },
      { edit: rightFist(0.6, 0.28), bLostSec: FRAME },
    ]);
    expect(found).toHaveLength(1);
  });

  it("상대에게 붙여 둔 가드 손(계속 닿아 있음)은 타격이 아니다", () => {
    const rest = { edit: rightFist(0.6, 0.28) };
    expect(run([rest, rest, rest, rest])).toHaveLength(0);
  });

  it("천천히 밀어 닿는 손(1.5 m/s 미만)은 타격이 아니다", () => {
    // 장면마다 화면 가로 1%씩 (몸통 길이 0.53 m 기준 약 1.1 m/s)
    const found = run([0.56, 0.57, 0.58, 0.59, 0.6].map((x) => ({ edit: rightFist(x, 0.28) })));
    expect(found).toHaveLength(0);
  });

  it("상대가 팔로 막으면 '막힘'으로 찾는다", () => {
    const found = run([
      { edit: rightFist(0.42, 0.42) },
      { edit: rightFist(0.5, 0.42) },
      { edit: rightFist(0.575, 0.42) }, // B의 앞쪽 아래팔(가드)에 닿음
      { edit: rightFist(0.57, 0.42) },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ limb: "punch", region: "arm", outcome: "blocked" });
  });

  it("상대 허벅지에 닿은 킥은 '킥 · 다리'로 찾는다", () => {
    const foot = (x: number, y: number): Edit => ({ [L.rightAnkle]: [x, y] });
    const found = run([
      { edit: foot(0.37, 0.9) },
      { edit: foot(0.46, 0.78) },
      { edit: foot(0.6, 0.68) }, // B 허벅지에 닿음
      { edit: foot(0.59, 0.69) },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slot: 0, limb: "kick", region: "leg", outcome: "hit" });
  });
});
