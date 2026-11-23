// Design Ref: §5.1 분석 시뮬레이션 — 분석한 장면 사이의 자세를 채워, 모니터가 화면을 바꿀 때마다(초당 약 60번) 부드럽게 그린다.
// 분석은 영상 장면이 나올 때만 된다 (예: 30fps 영상을 0.25배속으로 보면 1초에 7.5장).
// 그 사이를 앞뒤 두 장면의 중간 자세로 채워 그림이 뚝뚝 끊기지 않게 한다. 그림용이며 계산에는 쓰지 않는다.

import type { PoseLandmark } from "../types";
import type { TrackedPerson } from "./poseTracker";

/** 쌓아 둘 최근 장면 수 */
const MAX_SAMPLES = 8;
/** 장면 간격을 모를 때 쓰는 값 (초, 30fps) */
const DEFAULT_INTERVAL_SEC = 1 / 30;

interface Sample {
  /** 영상 속 시각 (초) */
  t: number;
  people: TrackedPerson[];
  /** 이 장면 분석이 끝난 실제 시각 (performance.now, ms) */
  wallMs: number;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

function lerpList(a: PoseLandmark[], b: PoseLandmark[], u: number): PoseLandmark[] {
  if (a.length !== b.length) return b;
  return b.map((q, i) => {
    const p = a[i];
    return { ...q, x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), z: lerp(p.z, q.z, u), visibility: lerp(p.visibility, q.visibility, u) };
  });
}

/** 두 장면 사이의 자세 (u = 0이면 앞 장면, 1이면 뒤 장면) */
export function lerpPeople(a: TrackedPerson[], b: TrackedPerson[], u: number): TrackedPerson[] {
  return b.map((pb) => {
    const pa = a.find((p) => p.slot === pb.slot);
    if (!pa) return pb;
    return {
      ...pb,
      image: lerpList(pa.image, pb.image, u),
      world: lerpList(pa.world, pb.world, u),
      predicted: u < 0.5 ? pa.predicted : pb.predicted,
    };
  });
}

export class PoseTimeline {
  private samples: Sample[] = [];
  /** 장면이 새로 들어올 때마다 1씩 는다 (다시 그릴지 판단용) */
  version = 0;

  reset() {
    this.samples = [];
    this.version += 1;
  }

  push(t: number, people: TrackedPerson[], wallMs: number) {
    const last = this.samples.at(-1);
    if (last && t < last.t) this.samples = []; // 뒤로 감음
    if (last && t === last.t) this.samples.pop(); // 같은 장면 다시 분석
    this.samples.push({ t, people, wallMs });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    this.version += 1;
  }

  /** 최근 장면 사이의 평균 간격 (영상 속 시간, 초) */
  interval(): number {
    const s = this.samples;
    if (s.length < 2) return DEFAULT_INTERVAL_SEC;
    const recent = s.slice(-5);
    const avg = (recent.at(-1)!.t - recent[0].t) / (recent.length - 1);
    return Math.min(0.25, Math.max(0.004, avg));
  }

  /**
   * 지금 그릴 영상 속 시각.
   * 가장 최근 장면보다 장면 한 칸만큼 늦게 따라가며, 다음 장면이 올 때쯤 최근 장면에 도착한다.
   * 멈춰 있으면 가장 최근 장면을 그린다.
   */
  displayTime(nowMs: number, playbackRate: number, paused: boolean): number | null {
    const last = this.samples.at(-1);
    if (!last) return null;
    if (paused || this.samples.length < 2) return last.t;
    const elapsed = (Math.max(0, nowMs - last.wallMs) / 1000) * playbackRate;
    return Math.min(last.t, last.t - this.interval() + elapsed);
  }

  /** 영상 속 시각 t의 자세 (앞뒤 장면 사이를 채운다) */
  sampleAt(t: number): TrackedPerson[] {
    const s = this.samples;
    if (s.length === 0) return [];
    if (t <= s[0].t) return s[0].people;
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i].t) {
        const a = s[i - 1];
        const b = s[i];
        return lerpPeople(a.people, b.people, (t - a.t) / (b.t - a.t));
      }
    }
    return s.at(-1)!.people;
  }
}
