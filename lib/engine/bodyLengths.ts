// Design Ref: §5.1 분석 시뮬레이션 — 선수마다 뼈 길이(=키)를 일정하게 유지한다.
// 관절 찾기 도구는 장면마다 뼈 길이를 조금씩 다르게 어림해서 모델의 키가 커졌다 작아졌다 한다.
// 처음 장면들에서 선수마다 뼈 길이를 재어 고정하고, 이후에는 "관절이 향하는 방향"만 따르고 길이는 고정값으로 다시 세운다.
// 키를 입력하면 그 키에 맞게 전체 크기를 맞춘다 (de Leva 1996 분절 길이 비율 사용).
// 그림용이다. 속도 계산의 m 환산은 PLAN 작업 6·13에서 따로 한다.

import type { PoseLandmark } from "../types";
import { segmentParam } from "../physics/body";
import { REFERENCE_STATURE_MM } from "../reference/segments";
import { LANDMARK as L } from "./landmarks";
import type { TrackedPerson } from "./poseTracker";

/** 길이를 고정하기 전 모을 장면 수 (30fps면 약 1초) */
export const CALIBRATION_SAMPLES = 30;
/** 이보다 잘 보이는 관절만 길이 재기에 쓴다 */
const MIN_VISIBILITY = 0.5;

export type BoneKey =
  | "hipHalf"
  | "shoulderHalf"
  | "torso"
  | "neck"
  | "upperArm"
  | "forearm"
  | "thigh"
  | "shank"
  | "foot"
  | "heel";

interface Point {
  x: number;
  y: number;
  z: number;
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a: Point) => Math.hypot(a.x, a.y, a.z);
const mid = (a: Point, b: Point): Point => scale(add(a, b), 0.5);
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * de Leva(1996) 표에서 (허벅지 + 정강이 + 몸통) 길이 ÷ 키 (남녀 평균).
 * 입력한 키에 맞춰 모델 크기를 정할 때 쓴다.
 */
export function legTrunkToStatureRatio(): number {
  const sum = (sex: "male" | "female") =>
    (["thigh", "shank", "trunk"] as const).reduce((s, seg) => s + segmentParam(seg).lengthMm[sex], 0);
  return (sum("male") / REFERENCE_STATURE_MM.male + sum("female") / REFERENCE_STATURE_MM.female) / 2;
}

/** 한 장면에서 잴 수 있는 뼈 길이들 (잘 보이고, 채워 넣은 관절이 아닌 것만) */
function measureBones(person: TrackedPerson): Partial<Record<BoneKey, number[]>> {
  const { world, image } = person;
  const estimated = new Set(person.estimatedJoints);
  const ok = (...joints: number[]) =>
    joints.every((j) => world[j] && image[j] && image[j].visibility >= MIN_VISIBILITY && !estimated.has(j));
  const out: Partial<Record<BoneKey, number[]>> = {};
  const put = (key: BoneKey, value: number) => (out[key] ??= []).push(value);
  const d = (a: number, b: number) => len(sub(world[a], world[b]));

  if (ok(L.leftHip, L.rightHip)) put("hipHalf", d(L.leftHip, L.rightHip) / 2);
  if (ok(L.leftShoulder, L.rightShoulder)) put("shoulderHalf", d(L.leftShoulder, L.rightShoulder) / 2);
  if (ok(L.leftShoulder, L.rightShoulder, L.leftHip, L.rightHip)) {
    const sh = mid(world[L.leftShoulder], world[L.rightShoulder]);
    put("torso", len(sub(sh, mid(world[L.leftHip], world[L.rightHip]))));
    if (ok(L.nose)) put("neck", len(sub(world[L.nose], sh)));
  }
  const pairs: [BoneKey, number, number][] = [
    ["upperArm", L.leftShoulder, L.leftElbow],
    ["upperArm", L.rightShoulder, L.rightElbow],
    ["forearm", L.leftElbow, L.leftWrist],
    ["forearm", L.rightElbow, L.rightWrist],
    ["thigh", L.leftHip, L.leftKnee],
    ["thigh", L.rightHip, L.rightKnee],
    ["shank", L.leftKnee, L.leftAnkle],
    ["shank", L.rightKnee, L.rightAnkle],
    ["foot", L.leftAnkle, L.leftFootIndex],
    ["foot", L.rightAnkle, L.rightFootIndex],
    ["heel", L.leftAnkle, L.leftHeel],
    ["heel", L.rightAnkle, L.rightHeel],
  ];
  for (const [key, a, b] of pairs) if (ok(a, b)) put(key, d(a, b));
  return out;
}

/** 고정한 뼈 길이로 3D 관절을 다시 세운다 (엉덩이 가운데는 그대로, 방향은 원래대로) */
export function rebuildSkeleton(world: PoseLandmark[], bones: Partial<Record<BoneKey, number>>): PoseLandmark[] {
  const out = world.map((p) => ({ ...p }));
  const place = (parentNew: Point, parentOld: Point, child: number, key: BoneKey) => {
    const length = bones[key];
    const old = world[child];
    if (!old) return;
    const dir = sub(old, parentOld);
    const l = len(dir);
    const p = length !== undefined && l > 1e-6 ? add(parentNew, scale(dir, length / l)) : add(parentNew, dir);
    out[child] = { ...old, x: p.x, y: p.y, z: p.z };
  };
  /** 길이를 따로 정하지 않는 점(손가락·얼굴)은 기준 관절이 움직인 만큼 같이 옮긴다 */
  const follow = (anchor: number, points: number[]) => {
    const shift = sub(out[anchor], world[anchor]);
    for (const i of points) if (world[i]) out[i] = { ...world[i], ...add(world[i], shift) };
  };

  const hipMid = mid(world[L.leftHip], world[L.rightHip]);
  place(hipMid, hipMid, L.leftHip, "hipHalf");
  place(hipMid, hipMid, L.rightHip, "hipHalf");

  // 어깨 가운데: 엉덩이 가운데에서 몸통 길이만큼
  const shOld = mid(world[L.leftShoulder], world[L.rightShoulder]);
  const torsoDir = sub(shOld, hipMid);
  const torsoLen = len(torsoDir);
  const shNew =
    bones.torso !== undefined && torsoLen > 1e-6 ? add(hipMid, scale(torsoDir, bones.torso / torsoLen)) : shOld;
  place(shNew, shOld, L.leftShoulder, "shoulderHalf");
  place(shNew, shOld, L.rightShoulder, "shoulderHalf");
  place(shNew, shOld, L.nose, "neck");
  follow(L.nose, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  for (const side of ["left", "right"] as const) {
    const s = side === "left";
    const shoulder = s ? L.leftShoulder : L.rightShoulder;
    const elbow = s ? L.leftElbow : L.rightElbow;
    const wrist = s ? L.leftWrist : L.rightWrist;
    const hip = s ? L.leftHip : L.rightHip;
    const knee = s ? L.leftKnee : L.rightKnee;
    const ankle = s ? L.leftAnkle : L.rightAnkle;
    place(out[shoulder], world[shoulder], elbow, "upperArm");
    place(out[elbow], world[elbow], wrist, "forearm");
    follow(wrist, s ? [L.leftPinky, L.leftIndex, 21] : [L.rightPinky, L.rightIndex, 22]);
    place(out[hip], world[hip], knee, "thigh");
    place(out[knee], world[knee], ankle, "shank");
    place(out[ankle], world[ankle], s ? L.leftHeel : L.rightHeel, "heel");
    place(out[ankle], world[ankle], s ? L.leftFootIndex : L.rightFootIndex, "foot");
  }
  return out;
}

interface SlotStats {
  samples: Partial<Record<BoneKey, number[]>>;
  locked: Partial<Record<BoneKey, number>>;
}

/** 선수마다 뼈 길이를 재고 고정해, 장면이 바뀌어도 키가 일정한 3D 관절을 내준다 */
export class SkeletonNormalizer {
  private slots = new Map<number, SlotStats>();
  private heightsM = new Map<number, number>();
  private lastTimeSec: number | null = null;

  /** 선수 키를 정한다 (cm). null이면 관절 찾기 도구가 어림한 크기를 쓴다 */
  setHeightCm(slot: number, cm: number | null) {
    if (cm === null) this.heightsM.delete(slot);
    else this.heightsM.set(slot, cm / 100);
  }

  reset() {
    this.slots.clear();
    this.lastTimeSec = null;
  }

  /** 지금 쓰는 뼈 길이 (m). 고정 전이면 지금까지 잰 값의 가운데 값 */
  bones(slot: number): Partial<Record<BoneKey, number>> {
    const stats = this.slots.get(slot);
    if (!stats) return {};
    const out: Partial<Record<BoneKey, number>> = {};
    for (const key of Object.keys(stats.samples) as BoneKey[]) {
      const values = stats.samples[key]!;
      out[key] = stats.locked[key] ?? median(values);
    }
    // 키를 입력했으면 (허벅지 + 정강이 + 몸통)이 그 키의 정해진 비율이 되도록 전체 크기를 맞춘다
    const height = this.heightsM.get(slot);
    if (height !== undefined && out.thigh && out.shank && out.torso) {
      const k = (height * legTrunkToStatureRatio()) / (out.thigh + out.shank + out.torso);
      for (const key of Object.keys(out) as BoneKey[]) out[key]! *= k;
    }
    return out;
  }

  apply(people: TrackedPerson[], timeSec: number): TrackedPerson[] {
    if (this.lastTimeSec !== null && timeSec < this.lastTimeSec) this.reset(); // 뒤로 감음
    this.lastTimeSec = timeSec;
    return people.map((person) => {
      let stats = this.slots.get(person.slot);
      if (!stats) {
        stats = { samples: {}, locked: {} };
        this.slots.set(person.slot, stats);
      }
      // 예측 중인 선수는 자세가 멈춰 있어 길이를 새로 재지 않는다
      if (!person.predicted) {
        const measured = measureBones(person);
        for (const key of Object.keys(measured) as BoneKey[]) {
          if (stats.locked[key] !== undefined) continue;
          const list = (stats.samples[key] ??= []);
          list.push(...measured[key]!);
          if (list.length >= CALIBRATION_SAMPLES) stats.locked[key] = median(list);
        }
      }
      return { ...person, world: rebuildSkeleton(person.world, this.bones(person.slot)) };
    });
  }
}
