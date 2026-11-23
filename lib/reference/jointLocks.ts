// Design Ref: §2.2 처리 "관절기 + 꺾는 각도" — 관절 정상 움직임 범위와 부상 기준
// PLAN 작업 4 (연구값 보강). PRD: 관절기는 정상 움직임 범위와 비교하고, 부상 판단은 자료가 있을 때만 한다.
//
// 주의:
//   - 부상 기준은 대부분 자동차 충돌·스포츠 부상을 본뜬 사체 실험이다. 꺾는 방향·속도가 관절기와 똑같지 않다.
//   - 팔꿈치 과신전·어깨 회전(기무라·아메리카나)·발목 발등 굽힘(앵클록)은 "부상이 일어나는 각도" 자료를 찾지 못했다.
//     팔꿈치는 각도 대신 굽힘 모멘트(N·m) 기준만 있다.
//   - 정상 범위는 20~44세 값을 쓴다 (선수 나이대).

import type { JointLockId, LockedJoint } from "../types";
import type { RefValue } from "./sources";

export interface JointRangeEntry extends RefValue {
  /** 어떤 움직임인지 (예: 팔꿈치 펴기) */
  motion: string;
  /** 측정 대상·방법 */
  population: string;
}

export interface JointLockReference {
  lock: JointLockId;
  joint: LockedJoint;
  /** 관절기가 억지로 만드는 움직임 */
  forcedMotion: string;
  /** 정상 움직임 범위 끝(°). 남녀가 다르면 둘 다 */
  normalRange: { male: JointRangeEntry; female: JointRangeEntry } | null;
  /** 부상이 일어나는 각도(°). 자료가 없으면 null → "자료 없음" */
  injuryAngle: JointRangeEntry | null;
  /** 각도가 아닌 부상 기준(모멘트 등)이나 비슷한 다른 방향 자료. 판단 문장에 참고로만 쓴다 */
  related: JointRangeEntry[];
}

const SOUCIE = "건강한 674명(2~69세) 중 20~44세, 물리치료사 9명이 각도기로 수동 측정 (CDC Joint ROM Study)";

const ELBOW_EXTENSION: JointLockReference["normalRange"] = {
  male: { motion: "팔꿈치 펴기 (0° 넘는 값 = 과신전)", value: 0.8, unit: "°", population: SOUCIE, sourceIds: ["soucie2011"], confidence: "high", verifiedPrimary: true, note: "95% 신뢰구간 0.1~1.5°" },
  female: { motion: "팔꿈치 펴기 (0° 넘는 값 = 과신전)", value: 4.7, unit: "°", population: SOUCIE, sourceIds: ["soucie2011"], confidence: "high", verifiedPrimary: true, note: "95% 신뢰구간 3.9~5.5°" },
};

const KNEE_EXTENSION: JointLockReference["normalRange"] = {
  male: { motion: "무릎 펴기 (0° 넘는 값 = 과신전)", value: 1.0, unit: "°", population: SOUCIE, sourceIds: ["soucie2011"], confidence: "high", verifiedPrimary: true, note: "95% 신뢰구간 0.6~1.4°" },
  female: { motion: "무릎 펴기 (0° 넘는 값 = 과신전)", value: 1.6, unit: "°", population: SOUCIE, sourceIds: ["soucie2011"], confidence: "high", verifiedPrimary: true, note: "95% 신뢰구간 1.1~2.1°" },
};

const MCCULLY = "건강한 성인 16명(남녀 8명씩, 23±3세), 팔 90° 벌림(관상면)·팔꿈치 90°, 수동 끝 범위(4 N·m 또는 불편할 때까지)";

export const JOINT_LOCK_REFERENCE: Record<JointLockId, JointLockReference> = {
  armbar: {
    lock: "armbar",
    joint: "elbow",
    forcedMotion: "팔꿈치를 정상 범위 너머로 펴기(과신전)",
    normalRange: ELBOW_EXTENSION,
    injuryAngle: null,
    related: [
      {
        motion: "팔꿈치 과신전 굽힘 모멘트",
        value: 56,
        unit: "N·m",
        population: "여성 사체 팔꿈치 24개, 빠른 과신전(에어백 충돌 모사)",
        sourceIds: ["duma2004"],
        confidence: "medium",
        verifiedPrimary: true,
        note: "부상 50% 위험 56 N·m, 탈구 50% 위험 93 N·m. 각도 기준은 없음",
      },
      {
        motion: "부상 뒤 늘어난 팔꿈치 펴짐",
        value: 16.7,
        unit: "°",
        population: "남성 사체 팔꿈치 10개, 과신전 + 뒤침",
        sourceIds: ["tyrdal1998"],
        confidence: "high",
        verifiedPrimary: true,
        note: "±8.7°. 부상이 일어난 각도가 아니라 부상 뒤 더 펴지게 된 양 (앞 관절주머니 파열·곁인대 떨어짐)",
      },
    ],
  },
  kimura: {
    lock: "kimura",
    joint: "shoulder",
    forcedMotion: "어깨를 안쪽으로 돌리기(내회전, 팔을 등 뒤로)",
    normalRange: {
      male: { motion: "어깨 안쪽 돌리기 (팔 90° 벌림)", value: 90, unit: "°", population: MCCULLY, sourceIds: ["mccully2005"], confidence: "medium", verifiedPrimary: true, note: "±22°, 남녀를 합친 값. 팔을 등 뒤로 돌린 자세(기무라)의 각도 자료는 없음" },
      female: { motion: "어깨 안쪽 돌리기 (팔 90° 벌림)", value: 90, unit: "°", population: MCCULLY, sourceIds: ["mccully2005"], confidence: "medium", verifiedPrimary: true, note: "±22°, 남녀를 합친 값" },
    },
    injuryAngle: null,
    related: [],
  },
  americana: {
    lock: "americana",
    joint: "shoulder",
    forcedMotion: "어깨를 바깥쪽으로 돌리기(외회전)",
    normalRange: {
      male: { motion: "어깨 바깥쪽 돌리기 (팔 90° 벌림)", value: 118, unit: "°", population: MCCULLY, sourceIds: ["mccully2005"], confidence: "medium", verifiedPrimary: true, note: "±21°, 남녀를 합친 값. 팔을 몸 옆에 붙이면 72±17°" },
      female: { motion: "어깨 바깥쪽 돌리기 (팔 90° 벌림)", value: 118, unit: "°", population: MCCULLY, sourceIds: ["mccully2005"], confidence: "medium", verifiedPrimary: true, note: "±21°, 남녀를 합친 값" },
    },
    injuryAngle: null,
    related: [],
  },
  kneebar: {
    lock: "kneebar",
    joint: "knee",
    forcedMotion: "무릎을 정상 범위 너머로 펴기(과신전)",
    normalRange: KNEE_EXTENSION,
    injuryAngle: {
      motion: "무릎 과신전 (뒤 관절주머니 파열)",
      value: 30,
      unit: "°",
      population: "사체 무릎",
      sourceIds: ["kennedy1963"],
      confidence: "low",
      verifiedPrimary: false,
      note: "약 30° 과신전에서 뒤 관절주머니가 찢어진다고 리뷰에서 인용됨. 원문 확인 못 함",
    },
    related: [],
  },
  heelHook: {
    lock: "heelHook",
    joint: "knee",
    forcedMotion: "정강이를 안쪽으로 비틀기(무릎 내회전)",
    normalRange: {
      male: { motion: "정강이 안쪽 돌리기 (4 N·m을 걸었을 때)", value: [17.5, 20], unit: "°", population: "건강한 40명, 로봇으로 무릎 30·60·90° 굽힘에서 측정", sourceIds: ["lorenz2015"], confidence: "medium", verifiedPrimary: true, note: "최대로 돌린 범위가 아니라 4 N·m 힘에서의 각도. 남녀 구분 없음" },
      female: { motion: "정강이 안쪽 돌리기 (4 N·m을 걸었을 때)", value: [17.5, 20], unit: "°", population: "건강한 40명, 로봇으로 무릎 30·60·90° 굽힘에서 측정", sourceIds: ["lorenz2015"], confidence: "medium", verifiedPrimary: true, note: "남녀 구분 없음" },
    },
    injuryAngle: {
      motion: "정강이 안쪽 비틀기 (앞십자인대 파열)",
      value: 58,
      unit: "°",
      population: "사체 무릎 7쌍, 점점 세게 비틀어 파열까지",
      sourceIds: ["meyer2008"],
      confidence: "medium",
      verifiedPrimary: true,
      note: "±19°, 파열 때 비트는 힘 33±13 N·m. 힐훅 자세 그대로의 실험은 아님",
    },
    related: [],
  },
  ankleLock: {
    lock: "ankleLock",
    joint: "ankle",
    forcedMotion: "발끝을 발바닥 쪽으로 억지로 꺾기(발바닥 굽힘 정상 범위 너머)",
    normalRange: {
      male: { motion: "발목 발바닥 굽힘", value: 54.6, unit: "°", population: SOUCIE, sourceIds: ["soucie2011"], confidence: "high", verifiedPrimary: true, note: "95% 신뢰구간 53.2~56.0°" },
      female: { motion: "발목 발바닥 굽힘", value: 62.1, unit: "°", population: SOUCIE, sourceIds: ["soucie2011"], confidence: "high", verifiedPrimary: true, note: "95% 신뢰구간 60.6~63.6°" },
    },
    injuryAngle: null,
    related: [
      {
        motion: "발 바깥쪽 비틀기 부상 (다른 방향 참고)",
        value: 40.7,
        unit: "°",
        population: "사체 발목 10개",
        sourceIds: ["wei2010"],
        confidence: "medium",
        verifiedPrimary: true,
        note: "±7.3°, 69.5±11.7 N·m. 앵클록(발바닥 굽힘)과 방향이 다름",
      },
      {
        motion: "발목 안쪽 젖힘(내번) 부상 (다른 방향 참고)",
        value: 38,
        unit: "°",
        population: "사체 하지, 누르는 힘 없이 중립 자세",
        sourceIds: ["funk2002"],
        confidence: "medium",
        verifiedPrimary: true,
        note: "±8°, 21±5 N·m. 앵클록(발바닥 굽힘)과 방향이 다름",
      },
    ],
  },
};

/** 관절기에서 찾지 못한 자료 */
export const JOINT_LOCK_GAPS: string[] = [
  "어깨 강제 안쪽·바깥쪽 돌리기(기무라·아메리카나)의 부상 각도·모멘트",
  "팔꿈치 과신전(암바)의 부상 각도 (모멘트 기준만 있음)",
  "발목 강제 발바닥 굽힘(앵클록)의 부상 각도·모멘트",
  "무릎 과신전 부상 각도의 원 논문 확인 (Kennedy 1963)",
  "팔을 등 뒤로 돌린 자세(기무라)의 정상 어깨 각도",
  "힐훅 자세 그대로의 사체 실험",
];
