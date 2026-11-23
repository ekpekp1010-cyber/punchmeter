// Design Ref: §5.1 분석 시뮬레이션 — 화면에 보여 줄 관절 위치의 떨림을 줄인다 (그림용).
// 관절 찾기 도구의 결과는 장면마다 몇 mm~cm씩 흔들려 모델이 덜덜 떨린다.
// "One Euro 필터"(Casiez 2012)를 쓴다: 느리게 움직일 때는 많이 걸러 떨림을 없애고, 빠르게 움직일 때(펀치·킥)는 적게 걸러 늦게 따라오지 않게 한다.
// 주의: 속도·힘 계산에는 이 값을 쓰지 않는다 (걸러낸 값은 최고 속도가 깎일 수 있다).

import type { PoseLandmark } from "../types";
import type { TrackedPerson } from "./poseTracker";

/** 한 숫자의 흐름을 걸러 주는 One Euro 필터 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;

  /**
   * @param minCutoff 멈춰 있을 때 거르는 정도 (Hz, 작을수록 더 매끄럽고 더 늦다)
   * @param beta 빠를수록 덜 거르게 하는 정도 (클수록 빠른 동작을 덜 늦게 따라간다)
   * @param dCutoff 속도 자체를 거르는 정도 (Hz)
   */
  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, timeSec: number): number {
    if (this.x === null || this.t === null) {
      this.x = value;
      this.t = timeSec;
      return value;
    }
    const dt = timeSec - this.t;
    if (dt <= 0) return this.x;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
    this.t = timeSec;
    return this.x;
  }
}

/**
 * 거르는 정도. 설정을 바꿔 가며 시험해 고른 값:
 * 30fps에서 8 m/s 펀치를 0.1초 동안 약 94% 따라가고, 제자리 떨림은 약 12%만 남는다 (120fps면 96% / 3%).
 */
const MIN_CUTOFF_HZ = 1;
const DERIVATIVE_CUTOFF_HZ = 3;
/** 실제 크기 3D 위치(m) 기준 */
const WORLD_BETA = 4;
/** 화면 위치(화면 높이 단위) 기준. 화면 높이 ≈ 2 m로 보면 같은 움직임의 숫자가 절반이라 2배로 잡는다 */
const IMAGE_BETA = 8;

/** 선수 2명 × 관절 33개의 떨림을 거른다 */
export class PoseSmoother {
  private filters = new Map<string, OneEuroFilter>();
  private lastTimeSec: number | null = null;

  reset() {
    this.filters.clear();
    this.lastTimeSec = null;
  }

  private smoothList(list: PoseLandmark[], key: string, beta: number, timeSec: number): PoseLandmark[] {
    return list.map((p, i) => {
      const f = (axis: "x" | "y" | "z") => {
        const id = `${key}:${i}:${axis}`;
        let filter = this.filters.get(id);
        if (!filter) {
          filter = new OneEuroFilter(MIN_CUTOFF_HZ, beta, DERIVATIVE_CUTOFF_HZ);
          this.filters.set(id, filter);
        }
        return filter.filter(p[axis], timeSec);
      };
      return { ...p, x: f("x"), y: f("y"), z: f("z") };
    });
  }

  apply(people: TrackedPerson[], timeSec: number): TrackedPerson[] {
    // 뒤로 감거나 처음부터 다시 보면 거르기도 새로 시작한다
    if (this.lastTimeSec !== null && timeSec < this.lastTimeSec) this.reset();
    this.lastTimeSec = timeSec;
    return people.map((person) => ({
      ...person,
      image: this.smoothList(person.image, `${person.slot}:image`, IMAGE_BETA, timeSec),
      world: this.smoothList(person.world, `${person.slot}:world`, WORLD_BETA, timeSec),
    }));
  }
}
