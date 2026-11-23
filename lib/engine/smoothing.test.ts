// 떨림 거르기와 장면 사이 채우기 검사
import { describe, expect, it } from "vitest";
import type { PoseLandmark } from "../types";
import { OneEuroFilter, PoseSmoother } from "./smoothing";
import { lerpPeople, PoseTimeline } from "./poseTimeline";
import type { TrackedPerson } from "./poseTracker";

const FRAME = 1 / 30;

function personAt(x: number, slot = 0, predicted = false): TrackedPerson {
  const p: PoseLandmark = { x, y: 0.5, z: 0, visibility: 0.9 };
  return { slot, image: [p, { ...p }], world: [{ ...p }, { ...p }], predicted, lostSec: 0, estimatedJoints: [] };
}

describe("떨림 거르기 (One Euro 필터)", () => {
  it("멈춰 있는 값은 그대로 둔다", () => {
    const f = new OneEuroFilter(1, 1);
    let out = 0;
    for (let i = 0; i < 30; i++) out = f.filter(0.4, i * FRAME);
    expect(out).toBeCloseTo(0.4, 10);
  });

  it("제자리에서 흔들리는 값의 흔들림을 크게 줄인다", () => {
    const f = new OneEuroFilter(1, 4, 3);
    const outs: number[] = [];
    for (let i = 0; i < 60; i++) outs.push(f.filter(i % 2 === 0 ? 0.01 : -0.01, i * FRAME));
    const late = outs.slice(30);
    const swing = Math.max(...late) - Math.min(...late);
    expect(swing).toBeLessThan(0.02 * 0.3); // 원래 흔들림(0.02)의 30% 미만
  });

  it("빠르게 움직이면 크게 늦지 않고 따라간다 (30fps, 8 m/s 펀치 0.1초 → 90% 이상)", () => {
    const f = new OneEuroFilter(1, 4, 3);
    let out = 0;
    for (let i = 0; i <= 3; i++) out = f.filter(8 * i * FRAME, i * FRAME);
    expect(out).toBeGreaterThan(0.9 * 8 * 3 * FRAME);
  });

  it("뒤로 감으면 처음부터 다시 거른다", () => {
    const s = new PoseSmoother();
    s.apply([personAt(0.2)], 5);
    const out = s.apply([personAt(0.8)], 1);
    expect(out[0].image[0].x).toBeCloseTo(0.8, 10);
  });
});

describe("장면 사이 채우기", () => {
  it("두 장면의 가운데 시각이면 가운데 자세를 준다", () => {
    const mid = lerpPeople([personAt(0.2)], [personAt(0.4)], 0.5);
    expect(mid[0].image[0].x).toBeCloseTo(0.3, 10);
  });

  it("선수 번호가 같은 사람끼리만 섞는다", () => {
    const mid = lerpPeople([personAt(0.2, 0), personAt(0.8, 1)], [personAt(0.85, 1), personAt(0.25, 0)], 0.5);
    expect(mid.find((p) => p.slot === 0)!.image[0].x).toBeCloseTo(0.225, 10);
    expect(mid.find((p) => p.slot === 1)!.image[0].x).toBeCloseTo(0.825, 10);
  });

  it("분석 결과가 들쭉날쭉 도착해도 그리기 시계는 끊기지 않고 고르게 흐른다", () => {
    const tl = new PoseTimeline();
    // 0.25배속 30fps: 장면은 실제 133ms마다 오지만, 도착 시각이 ±40ms씩 흔들린다
    const jitter = [0, 35, -40, 20, -10, 40, -35, 5, 30, -20, 0, 25, -30, 10, -5, 40, -40, 15, 0, -25];
    let wall = 0;
    let next = 0;
    let prevT: number | null = null;
    const steps: number[] = [];
    for (let k = 0; k < jitter.length; k++) {
      const arrival = k * 133 + jitter[k];
      // 모니터 새로고침(16ms)마다 그린다
      for (; wall < arrival; wall += 16) {
        const t = tl.displayTime(wall, 0.25, false);
        if (t !== null && prevT !== null && k > 4) steps.push(t - prevT);
        if (t !== null) prevT = t;
      }
      tl.push(next * FRAME, [personAt(0.2 + next * 0.01)], arrival);
      next += 1;
    }
    // 뒤로 가지 않고, 한 번에 크게 뛰지 않는다 (고른 흐름 1칸 = 16ms × 0.25배속 = 0.004초)
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...steps)).toBeLessThan(0.004 * 3);
  });

  it("그리기 시계는 최근 장면을 넘어가지 않고, 멈추면 최근 장면을 보여 준다", () => {
    const tl = new PoseTimeline();
    tl.push(0, [personAt(0.2)], 0);
    tl.push(FRAME, [personAt(0.4)], 100);
    expect(tl.displayTime(100000, 1, false)!).toBeLessThanOrEqual(FRAME);
    expect(tl.displayTime(100, 1, true)).toBeCloseTo(FRAME, 10);
  });

  it("뒤로 감으면 쌓아 둔 장면을 비운다", () => {
    const tl = new PoseTimeline();
    tl.push(5, [personAt(0.2)], 0);
    tl.push(1, [personAt(0.6)], 10);
    expect(tl.sampleAt(3)[0].image[0].x).toBeCloseTo(0.6, 10);
  });
});
