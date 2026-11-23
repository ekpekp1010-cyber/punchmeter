// Design Ref: §3 데이터 모델 — 노릴(맞을) 부위 22곳의 이름·구역·좌우
// PLAN 작업 5 (기술·부위 목록). 화면 표시 이름과 묶음(머리·몸통·팔·다리)을 한곳에서 정한다.
// left/right는 맞는 선수 본인 기준이다.

import type { BodyPart, BodyRegion } from "../types";

export interface BodyPartInfo {
  id: BodyPart;
  /** 화면에 보이는 이름 */
  nameKo: string;
  region: BodyRegion;
  side: "left" | "right" | "center";
}

export const BODY_PARTS: BodyPartInfo[] = [
  // 머리 7곳
  { id: "jaw", nameKo: "턱", region: "head", side: "center" },
  { id: "nose", nameKo: "코", region: "head", side: "center" },
  { id: "cheekLeft", nameKo: "왼 광대", region: "head", side: "left" },
  { id: "cheekRight", nameKo: "오른 광대", region: "head", side: "right" },
  { id: "forehead", nameKo: "이마", region: "head", side: "center" },
  { id: "templeLeft", nameKo: "왼 관자놀이", region: "head", side: "left" },
  { id: "templeRight", nameKo: "오른 관자놀이", region: "head", side: "right" },
  // 몸통 5곳
  { id: "solarPlexus", nameKo: "명치", region: "torso", side: "center" },
  { id: "ribsLeft", nameKo: "왼 옆구리", region: "torso", side: "left" },
  { id: "ribsRight", nameKo: "오른 옆구리", region: "torso", side: "right" },
  { id: "liver", nameKo: "간", region: "torso", side: "right" },
  { id: "abdomen", nameKo: "복부", region: "torso", side: "center" },
  // 팔 4곳
  { id: "upperArmLeft", nameKo: "왼 위팔", region: "arm", side: "left" },
  { id: "upperArmRight", nameKo: "오른 위팔", region: "arm", side: "right" },
  { id: "forearmLeft", nameKo: "왼 아래팔", region: "arm", side: "left" },
  { id: "forearmRight", nameKo: "오른 아래팔", region: "arm", side: "right" },
  // 다리 6곳
  { id: "thighLeft", nameKo: "왼 허벅지", region: "leg", side: "left" },
  { id: "thighRight", nameKo: "오른 허벅지", region: "leg", side: "right" },
  { id: "calfLeft", nameKo: "왼 종아리", region: "leg", side: "left" },
  { id: "calfRight", nameKo: "오른 종아리", region: "leg", side: "right" },
  { id: "shinLeft", nameKo: "왼 정강이", region: "leg", side: "left" },
  { id: "shinRight", nameKo: "오른 정강이", region: "leg", side: "right" },
];

const BY_ID = new Map(BODY_PARTS.map((p) => [p.id, p]));

/** 부위 정보 찾기 */
export function bodyPartInfo(id: BodyPart): BodyPartInfo {
  const info = BY_ID.get(id);
  if (!info) throw new Error(`알 수 없는 부위: ${id}`);
  return info;
}
