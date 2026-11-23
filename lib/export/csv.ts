// Design Ref: §2.2 "CSV 칸", §4.3 — 타격별 결과표를 브라우저 안에서 CSV로 만든다 (PLAN 작업 20)
// - 칸 순서는 DESIGN.md §2.2 "CSV 칸"과 같다
// - 자료가 없는 칸은 빈 값이 아니라 "자료 없음"
// - 엑셀에서 한글이 깨지지 않게 맨 앞에 BOM(﻿)을 붙인다
// - 파일 이름: punchmeter_{날짜}_{시각}.csv (예: punchmeter_2026-11-23_1530.csv)

import { bodyPartInfo, shortCite, techniqueInfo } from "../reference";
import type { Estimate, EstimateBasis, Fighter, FighterId, StrikeResult } from "../types";

export const CSV_HEADER = [
  "순서",
  "때린 선수",
  "글러브(oz)",
  "기술",
  "노린 부위",
  "수비",
  "맞은 부위",
  "속도(m/s)",
  "속도 근거",
  "운동량_계체량",
  "운동량_리게인(추정)",
  "운동에너지_계체량",
  "운동에너지_리게인(추정)",
  "충격력_계체량",
  "충격력_리게인(추정)",
  "충격력_범위",
  "강도지수_계체량",
  "강도지수_리게인(추정)",
  "의학적 판단",
  "출처",
] as const;

const BASIS_TEXT: Record<EstimateBasis, string> = {
  research: "연구값",
  userInput: "사용자 입력값",
  estimated: "추정",
  noData: "자료 없음",
};

const NO_DATA = "자료 없음";

function num(e: Estimate, digits: number): string {
  return e.value === null ? NO_DATA : e.value.toFixed(digits);
}

function range(e: Estimate, digits: number): string {
  return e.low === undefined || e.high === undefined ? NO_DATA : `${e.low.toFixed(digits)}~${e.high.toFixed(digits)}`;
}

/** CSV 한 칸: 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 따옴표는 두 번 쓴다 */
export function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 타격 결과들 → CSV 글 (BOM 포함) */
export function buildCsv(results: StrikeResult[], fighters: Record<FighterId, Fighter>): string {
  const rows = results.map((r, i) => {
    const attacker = fighters[r.step.attacker];
    const sources = [
      ...new Set([
        ...r.speed.sourceIds,
        ...r.force.weighIn.sourceIds,
        ...r.force.regain.sourceIds,
        ...r.intensityIndex.weighIn.sourceIds,
        ...r.medical.sourceIds,
      ]),
    ];
    return [
      i + 1,
      r.step.attacker,
      techniqueInfo(r.step.technique).kind === "punch" ? attacker.gloveOz : `${attacker.gloveOz} (펀치가 아니라 보정 안 함)`,
      techniqueInfo(r.step.technique).nameKo,
      bodyPartInfo(r.step.target).nameKo,
      r.step.defense === "none" ? "맞음" : "막음",
      bodyPartInfo(r.hitPart).nameKo,
      num(r.speed, 2),
      BASIS_TEXT[r.speed.basis],
      num(r.momentum.weighIn, 2),
      num(r.momentum.regain, 2),
      num(r.energy.weighIn, 1),
      num(r.energy.regain, 1),
      num(r.force.weighIn, 0),
      num(r.force.regain, 0),
      range(r.force.weighIn, 0),
      num(r.intensityIndex.weighIn, 1),
      num(r.intensityIndex.regain, 1),
      r.medical.text,
      sources.map(shortCite).join("; "),
    ].map(csvCell);
  });
  const lines = [CSV_HEADER.map(csvCell).join(","), ...rows.map((r) => r.join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** 내려받기 파일 이름 (확장자 제외): punchmeter_2026-11-23_1530 */
export function exportBaseName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `punchmeter_${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}
