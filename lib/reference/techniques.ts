// Design Ref: §2.2 처리 ① 기술 정보 찾기 — 기술마다 속도 기본값·범위, 유효 질량, 쓰는 팔다리, 노릴 수 있는 부위
// PLAN 작업 5 (기술·부위 목록). 숫자는 모두 strikes.ts의 연구값에서 가져오고 출처를 함께 단다.
//
// 속도 범위를 정하는 규칙 (숫자를 새로 만들지 않기 위해 한 가지 규칙만 쓴다):
//   - 연구에 묶음 평균(초보·숙련, 주니어·엘리트, 연구 여러 개)이 여럿 있으면 → 가장 낮은 평균 ~ 가장 높은 평균
//   - 평균이 하나뿐이면 → 평균 ± 표준편차 (소수 둘째 자리까지)
//   - 기본값은 가장 숙련된 묶음의 평균 (예: 엘리트 복서)
//   - 자료가 없으면 null → 화면에서 "자료 없음 — 직접 입력", 넣은 값은 "사용자 입력값"
// 속도는 "닿는 순간(또는 최고) 끝점 속도"다. 연구마다 잰 지점(주먹·발목·발)이 조금씩 달라 note에 적는다.

import type { BodyPart, TechniqueId, TechniqueKind } from "../types";
import { BODY_PARTS } from "./bodyParts";
import type { Confidence } from "./sources";
import type { Segment } from "./segments";

const BODY_PART_SIDE = new Map(BODY_PARTS.map((p) => [p.id, p.side]));

/** 상대에게 닿는 부분 */
export type ContactSurface = "fist" | "shin" | "foot" | "elbow" | "knee";

export interface SpeedReference {
  /** 기본값 (m/s) */
  defaultMps: number;
  /** 조절할 수 있는 범위 (m/s) */
  rangeMps: [number, number];
  /** 범위를 어떻게 정했는지 */
  rangeRule: "groupMeans" | "meanSd";
  sourceIds: string[];
  confidence: Confidence;
  note: string;
}

/**
 * 유효 질량을 어디서 가져오는지.
 * - research: 운동량 계산에 맞는 impulse 방식 연구값(kg)이 있음
 * - segmentEstimate: 자료가 없어 PLAN 작업 6에서 움직이는 분절(de Leva 비율표)의 무게로 어림 → "추정"
 */
export type EffectiveMassReference =
  | {
      basis: "research";
      kg: number;
      /** 추정 범위 (평균 ± 표준편차) */
      rangeKg: [number, number];
      sourceIds: string[];
      note: string;
    }
  | { basis: "segmentEstimate"; segments: Segment[]; note: string };

export interface TechniqueInfo {
  id: TechniqueId;
  nameKo: string;
  kind: TechniqueKind;
  /** 손(팔꿈치)을 쓰는지 다리(무릎)를 쓰는지 */
  limb: "arm" | "leg";
  contact: ContactSurface;
  /** 속도 연구값. 없으면 null */
  speed: SpeedReference | null;
  effectiveMass: EffectiveMassReference;
  /** 노릴 수 있는 부위 */
  targets: BodyPart[];
  /** "팔로 막음"일 때 받아 내는 부위 (아래팔 / 정강이). 좌우는 동작 방향으로 정한다 (PLAN 작업 13) */
  blockedBy: "forearm" | "shin";
}

const HEAD_FRONT: BodyPart[] = ["jaw", "nose", "forehead", "cheekLeft", "cheekRight"];
const HEAD_SIDE: BodyPart[] = ["jaw", "cheekLeft", "cheekRight", "templeLeft", "templeRight"];
const PUNCH_SEGMENTS: Segment[] = ["hand", "forearm", "upperArm"];
const KICK_SEGMENTS: Segment[] = ["foot", "shank", "thigh"];

export const TECHNIQUES: TechniqueInfo[] = [
  // ── 펀치 ──
  {
    id: "jab",
    nameKo: "잽",
    kind: "punch",
    limb: "arm",
    contact: "fist",
    speed: {
      defaultMps: 5.63,
      rangeMps: [5.05, 6.21],
      rangeRule: "meanSd",
      sourceIds: ["liu2022b"],
      confidence: "high",
      note: "복서 11명, 닿는 순간 속도 5.63 ± 0.584 m/s",
    },
    effectiveMass: { basis: "segmentEstimate", segments: PUNCH_SEGMENTS, note: "잽의 impulse 방식 유효 질량 자료 없음" },
    targets: [...HEAD_FRONT, "solarPlexus", "abdomen"],
    blockedBy: "forearm",
  },
  {
    id: "cross",
    nameKo: "크로스(스트레이트)",
    kind: "punch",
    limb: "arm",
    contact: "fist",
    speed: {
      defaultMps: 9.14,
      rangeMps: [8.1, 9.14],
      rangeRule: "groupMeans",
      sourceIds: ["walilko2005", "piorkowski2011", "dinu2020"],
      confidence: "high",
      note: "올림픽 복서 9.14, 복서 10명 8.22, 주니어·엘리트 모두 8.1 m/s",
    },
    effectiveMass: {
      basis: "research",
      kg: 2.9,
      rangeKg: [0.9, 4.9],
      sourceIds: ["walilko2005"],
      note: "올림픽 복서 스트레이트 18회, impulse 방식 2.9 ± 2.0 kg (펀치면 글러브 무게를 더한다). 체중과 상관없는 평균값이라 계체량·리게인이 같다",
    },
    targets: [...HEAD_FRONT, "solarPlexus", "abdomen"],
    blockedBy: "forearm",
  },
  {
    id: "hook",
    nameKo: "훅",
    kind: "punch",
    limb: "arm",
    contact: "fist",
    speed: {
      defaultMps: 11.2,
      rangeMps: [8.9, 11.95],
      rangeRule: "groupMeans",
      sourceIds: ["dinu2020", "stanley2018"],
      confidence: "high",
      note: "뒷손 훅 주니어 8.9 / 엘리트 11.2, 아마추어 앞손 훅 최고 속도 11.95 m/s",
    },
    effectiveMass: { basis: "segmentEstimate", segments: PUNCH_SEGMENTS, note: "훅의 impulse 방식 유효 질량 자료 없음" },
    targets: [...HEAD_SIDE, "ribsLeft", "ribsRight", "liver"],
    blockedBy: "forearm",
  },
  {
    id: "uppercut",
    nameKo: "어퍼컷",
    kind: "punch",
    limb: "arm",
    contact: "fist",
    speed: {
      defaultMps: 10.2,
      rangeMps: [7.3, 10.2],
      rangeRule: "groupMeans",
      sourceIds: ["dinu2020"],
      confidence: "high",
      note: "뒷손 어퍼컷 주니어 7.3 / 엘리트 10.2 m/s",
    },
    effectiveMass: { basis: "segmentEstimate", segments: PUNCH_SEGMENTS, note: "어퍼컷 유효 질량 자료 없음" },
    targets: ["jaw", "nose", "solarPlexus", "abdomen", "liver"],
    blockedBy: "forearm",
  },
  // ── 킥 ──
  {
    id: "lowKick",
    nameKo: "로우킥",
    kind: "kick",
    limb: "leg",
    contact: "shin",
    speed: {
      defaultMps: 12.46,
      rangeMps: [12.19, 12.46],
      rangeRule: "groupMeans",
      sourceIds: ["praphanbundit2020"],
      confidence: "low",
      note: "프로 무에타이 7명, 팔을 앞으로 12.46 / 뒤로 12.19 m/s. 잰 지점을 밝히지 않음",
    },
    effectiveMass: { basis: "segmentEstimate", segments: KICK_SEGMENTS, note: "로우킥 impulse 방식 유효 질량 자료 없음" },
    targets: ["thighLeft", "thighRight"],
    blockedBy: "shin",
  },
  {
    id: "calfKick",
    nameKo: "카프킥",
    kind: "kick",
    limb: "leg",
    contact: "shin",
    speed: null,
    effectiveMass: { basis: "segmentEstimate", segments: KICK_SEGMENTS, note: "카프킥 자료 없음" },
    targets: ["calfLeft", "calfRight"],
    blockedBy: "shin",
  },
  {
    id: "middleKick",
    nameKo: "미들킥",
    kind: "kick",
    limb: "leg",
    contact: "shin",
    speed: {
      defaultMps: 14.36,
      rangeMps: [14.36, 14.66],
      rangeRule: "groupMeans",
      sourceIds: ["praphanbundit2020"],
      confidence: "low",
      note: "프로 무에타이 7명, 팔을 앞으로 14.36 / 뒤로 14.66 m/s. 잰 지점을 밝히지 않음",
    },
    effectiveMass: { basis: "segmentEstimate", segments: KICK_SEGMENTS, note: "미들킥 impulse 방식 유효 질량 자료 없음" },
    targets: ["ribsLeft", "ribsRight", "liver", "upperArmLeft", "upperArmRight"],
    blockedBy: "forearm",
  },
  {
    id: "highKick",
    nameKo: "하이킥",
    kind: "kick",
    limb: "leg",
    contact: "shin",
    speed: {
      defaultMps: 7.22,
      rangeMps: [5.57, 7.22],
      rangeRule: "groupMeans",
      sourceIds: ["gavagan2017"],
      confidence: "high",
      note: "머리 높이 돌려차기, 닿는 순간 발 속도: 가라테 5.57 / 태권도 6.36 / 무에타이 7.22 m/s (각 8명)",
    },
    effectiveMass: { basis: "segmentEstimate", segments: KICK_SEGMENTS, note: "하이킥 impulse 방식 유효 질량 자료 없음" },
    targets: [...HEAD_SIDE],
    blockedBy: "forearm",
  },
  {
    id: "frontKick",
    nameKo: "프런트킥",
    kind: "kick",
    limb: "leg",
    contact: "foot",
    speed: {
      defaultMps: 7.7,
      rangeMps: [6.67, 8.73],
      rangeRule: "meanSd",
      sourceIds: ["vagner2019"],
      confidence: "high",
      note: "남자 군인 25명, 발목 표식의 닿기 10 ms 전 속도 7.7 ± 1.03 m/s",
    },
    effectiveMass: { basis: "segmentEstimate", segments: KICK_SEGMENTS, note: "앞차기 impulse 방식 유효 질량 자료 없음" },
    targets: ["solarPlexus", "abdomen"],
    blockedBy: "forearm",
  },
  {
    id: "sideKick",
    nameKo: "사이드킥",
    kind: "kick",
    limb: "leg",
    contact: "foot",
    speed: {
      defaultMps: 9.5,
      rangeMps: [6.8, 9.5],
      rangeRule: "groupMeans",
      sourceIds: ["hidayat2025"],
      confidence: "medium",
      note: "발 최고 속도, 초보 20명 6.8 / 숙련 20명 9.5 m/s",
    },
    effectiveMass: { basis: "segmentEstimate", segments: KICK_SEGMENTS, note: "옆차기 impulse 방식 유효 질량 자료 없음" },
    targets: ["solarPlexus", "abdomen", "ribsLeft", "ribsRight", "liver", "thighLeft", "thighRight"],
    blockedBy: "forearm",
  },
  // ── 팔꿈치·무릎 ──
  {
    id: "elbow",
    nameKo: "팔꿈치",
    kind: "elbow",
    limb: "arm",
    contact: "elbow",
    speed: null,
    effectiveMass: { basis: "segmentEstimate", segments: ["forearm", "upperArm"], note: "팔꿈치 유효 질량 자료 없음" },
    targets: [...HEAD_SIDE, "forehead", "nose"],
    blockedBy: "forearm",
  },
  {
    id: "knee",
    nameKo: "무릎",
    kind: "knee",
    limb: "leg",
    contact: "knee",
    speed: {
      defaultMps: 11.0,
      rangeMps: [7.8, 11.0],
      rangeRule: "groupMeans",
      sourceIds: ["leemcgill2017"],
      confidence: "low",
      note: "무에타이 클럽 선수 훈련 전 7.8 / 훈련 뒤 11.0 m/s. 숫자가 서로 맞지 않는 곳이 있어 믿음 낮음",
    },
    effectiveMass: { basis: "segmentEstimate", segments: ["thigh", "shank", "foot"], note: "무릎 유효 질량 자료 없음" },
    // 턱·코 무릎은 클린치로 상대 머리를 당겨 내려야 해서, 두 선수가 선 채로 재생하는 이 앱에서는 다루지 않는다
    targets: ["solarPlexus", "abdomen", "liver", "ribsLeft", "ribsRight", "thighLeft", "thighRight"],
    blockedBy: "forearm",
  },
];

const BY_ID = new Map(TECHNIQUES.map((t) => [t.id, t]));

/** 기술 정보 찾기 */
export function techniqueInfo(id: TechniqueId): TechniqueInfo {
  const info = BY_ID.get(id);
  if (!info) throw new Error(`알 수 없는 기술: ${id}`);
  return info;
}

/** 이 기술로 이 부위를 노릴 수 있는가 */
export function canTarget(id: TechniqueId, part: BodyPart): boolean {
  return techniqueInfo(id).targets.includes(part);
}

/** 옆에서 휘어 들어오는 기술 — 손발이 들어오는 쪽의 부위만 칠 수 있다 (예: 뒷발 로우킥 → 상대 왼 허벅지 바깥) */
const SIDE_LOCKED: TechniqueId[] = ["hook", "uppercut", "lowKick", "calfKick", "middleKick", "highKick", "elbow", "knee"];

/**
 * 앞손·뒷손(앞발·뒷발)으로 이 부위를 칠 수 있는가 (두 선수 모두 오소독스라 가정).
 * 마주 보면 공격자의 왼쪽(앞손)은 상대의 오른쪽으로, 오른쪽(뒷손)은 상대의 왼쪽으로 들어간다.
 * 훅·어퍼컷은 몸을 가로질러 반대쪽을 칠 수 없다 (예: 간 = 상대 오른쪽 → 앞손 훅). 가운데 부위는 어느 쪽이든 된다.
 */
export function sideCanTarget(id: TechniqueId, side: "lead" | "rear", part: BodyPart): boolean {
  if (!canTarget(id, part)) return false;
  if (!SIDE_LOCKED.includes(id)) return true;
  const partSide = BODY_PART_SIDE.get(part);
  if (partSide === "center" || partSide === undefined) return true;
  return side === "lead" ? partSide === "right" : partSide === "left";
}
