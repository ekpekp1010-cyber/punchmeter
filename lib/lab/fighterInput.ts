// Design Ref: §5.4 화면 확인 목록 "선수 정보: 계체량 40~150kg, 키 140~220cm 밖이면 안내", §6 오류 처리
// PLAN 작업 10. 입력 칸의 글자를 검사해 Fighter로 바꾼다. 화면(React)과 분리해 자동 테스트한다.

import { HEIGHT_MAX_CM, HEIGHT_MIN_CM, WEIGH_IN_MAX_KG, WEIGH_IN_MIN_KG } from "../physics";
import type { Fighter, FighterId, GloveOz, Sex } from "../types";

/** 리치 입력 범위(cm) — 숫자 실수(예: 1800)를 막기 위한 칸 범위. 계산 기준값이 아니다 */
export const REACH_MIN_CM = 120;
export const REACH_MAX_CM = 250;

export const GLOVE_OPTIONS: GloveOz[] = [0, 4, 8, 10, 12, 14, 16];

/** 입력 칸 그대로의 값 (숫자 칸은 글자) */
export interface FighterDraft {
  id: FighterId;
  sex: Sex;
  weighIn: string;
  height: string;
  /** 빈 글자면 리치 입력 안 함 */
  reach: string;
  gloveOz: GloveOz;
}

export interface FighterErrors {
  weighIn?: string;
  height?: string;
  reach?: string;
}

export interface FighterCheck {
  /** 모든 칸이 올바르면 선수 정보, 아니면 null */
  fighter: Fighter | null;
  errors: FighterErrors;
}

/** 글자를 숫자로. 빈칸이나 숫자가 아니면 null (쉼표 소수점도 받는다) */
function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 칸 이름과 조사 (예: 계체량은 / 계체량을) */
interface Label {
  topic: string;
  object: string;
}

const WEIGH_IN: Label = { topic: "계체량은", object: "계체량을" };
const HEIGHT: Label = { topic: "키는", object: "키를" };
const REACH: Label = { topic: "리치는", object: "리치를" };

function checkRange(text: string, min: number, max: number, unit: string, label: Label): [number | null, string | undefined] {
  const n = parseNumber(text);
  if (n === null) return [null, `${label.object} 숫자로 넣어 주세요 (${min}~${max}${unit})`];
  if (n < min || n > max) return [null, `${label.topic} ${min}~${max}${unit} 사이로 넣어 주세요`];
  return [n, undefined];
}

/** 입력 칸 검사 */
export function checkFighter(d: FighterDraft): FighterCheck {
  const errors: FighterErrors = {};
  const [weighInKg, e1] = checkRange(d.weighIn, WEIGH_IN_MIN_KG, WEIGH_IN_MAX_KG, "kg", WEIGH_IN);
  const [heightCm, e2] = checkRange(d.height, HEIGHT_MIN_CM, HEIGHT_MAX_CM, "cm", HEIGHT);
  if (e1) errors.weighIn = e1;
  if (e2) errors.height = e2;

  let reachCm: number | undefined;
  if (d.reach.trim() !== "") {
    const [r, e3] = checkRange(d.reach, REACH_MIN_CM, REACH_MAX_CM, "cm", REACH);
    if (e3) errors.reach = e3;
    else reachCm = r as number;
  }

  if (weighInKg === null || heightCm === null || errors.reach) return { fighter: null, errors };
  const fighter: Fighter = { id: d.id, sex: d.sex, weighInKg, heightCm, gloveOz: d.gloveOz };
  if (reachCm !== undefined) fighter.reachCm = reachCm;
  return { fighter, errors };
}

/** 선수 정보를 입력 칸 글자로 (처음 값 채우기) */
export function toDraft(f: Fighter): FighterDraft {
  return {
    id: f.id,
    sex: f.sex,
    weighIn: String(f.weighInKg),
    height: String(f.heightCm),
    reach: f.reachCm === undefined ? "" : String(f.reachCm),
    gloveOz: f.gloveOz,
  };
}
