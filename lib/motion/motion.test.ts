// Design Ref: §8.3 동작 테스트 — 닿는 시각의 끝점 속도 = 정한 속도(±1%), 끝점 위치 = 노린 부위, 관절 각도 범위
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { solveTwoBone } from "./ik";
import { extendDuration } from "./path";
import { punchMotion, type PunchId, type StrikeFrame } from "./strikeMotion";

const frame: StrikeFrame = {
  forward: new Vector3(1, 0, 0),
  up: new Vector3(0, 1, 0),
  outward: new Vector3(0, 0, 1),
};
const guard = new Vector3(0.25, 1.5, 0.1);
const target = new Vector3(0.75, 1.55, 0);

/** 시각 t 바로 앞 짧은 구간의 평균 속도 */
function speedAt(m: ReturnType<typeof punchMotion>, t: number, dt = 1e-4) {
  return m.sample(t).effector.distanceTo(m.sample(t - dt).effector) / dt;
}

describe("펀치 동작: 닿는 순간 속도와 위치", () => {
  for (const kind of ["jab", "cross", "hook", "uppercut"] as PunchId[]) {
    it(`${kind}: 닿는 순간 주먹 속도가 정한 속도의 ±1%, 위치는 노린 곳`, () => {
      const v = 9.14;
      const m = punchMotion(kind, guard, target, frame, v);
      const c = m.timing.contactTime - 1e-9;
      expect(Math.abs(speedAt(m, c) - v) / v).toBeLessThan(0.01);
      expect(m.sample(m.timing.contactTime).effector.distanceTo(target)).toBeLessThan(1e-6);
    });
  }

  it("같은 기술이라도 빠르면 뻗는 시간이 짧다 (뻗는 시간 = 2 × 경로 길이 ÷ 속도)", () => {
    const slow = punchMotion("jab", guard, target, frame, 5);
    const fast = punchMotion("jab", guard, target, frame, 10);
    expect(fast.timing.extend).toBeCloseTo(slow.timing.extend / 2, 9);
    expect(slow.timing.extend).toBeCloseTo(extendDuration(guard.distanceTo(target), 5), 6);
  });

  it("훅은 바깥쪽에서 휘어 들어오고, 어퍼컷은 아래에서 올라온다", () => {
    const hook = punchMotion("hook", guard, target, frame, 10);
    const mid = hook.sample(hook.timing.pre + hook.timing.extend * 0.6).effector;
    expect(mid.z).toBeGreaterThan(0.1); // 바깥(+z)으로 휨
    const up = punchMotion("uppercut", guard, target, frame, 10);
    const before = up.sample(up.timing.contactTime - 0.005).effector;
    expect(before.y).toBeLessThan(target.y); // 닿기 직전 주먹이 목표보다 아래
  });

  it("회수 뒤에는 가드 자리로 돌아온다", () => {
    const m = punchMotion("cross", guard, target, frame, 8);
    expect(m.sample(m.timing.total).effector.distanceTo(guard)).toBeLessThan(1e-9);
  });
});

describe("두 뼈 IK", () => {
  const S = new Vector3(0, 1.4, 0);
  const pole = new Vector3(0, 0.5, -0.3);

  it("닿는 거리면 위·아래 뼈 길이를 지키며 끝점이 목표에 간다", () => {
    const T = new Vector3(0.5, 1.45, 0.1);
    const r = solveTwoBone(S, T, 0.3, 0.33, pole);
    expect(r.reached).toBe(true);
    expect(r.joint.distanceTo(S)).toBeCloseTo(0.3, 6);
    expect(r.joint.distanceTo(T)).toBeCloseTo(0.33, 6);
    expect(r.end.distanceTo(T)).toBeLessThan(1e-9);
  });

  it("너무 멀면 팔을 거의 다 펴고 닿지 않았다고 알린다", () => {
    const r = solveTwoBone(S, new Vector3(2, 1.4, 0), 0.3, 0.33, pole);
    expect(r.reached).toBe(false);
    expect(r.jointAngleDeg).toBeGreaterThan(170);
  });

  it("펀치 경로 전체에서 팔꿈치 각도가 사람이 굽힐 수 있는 범위(약 20~180°) 안", () => {
    const m = punchMotion("hook", guard, target, frame, 10);
    for (let t = 0; t <= m.timing.total; t += 0.01) {
      const r = solveTwoBone(S.clone().setX(0.1), m.sample(t).effector, 0.3, 0.36, pole);
      expect(r.jointAngleDeg).toBeGreaterThanOrEqual(20);
      expect(r.jointAngleDeg).toBeLessThanOrEqual(180);
    }
  });
});
