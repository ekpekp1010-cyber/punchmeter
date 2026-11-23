// PLAN 작업 20: CSV 칸 순서·BOM·자료 없음·파일 이름 확인
import { describe, expect, it } from "vitest";
import { buildStrikeResult } from "../lab";
import type { Fighter, StrikeStep } from "../types";
import { CSV_HEADER, buildCsv, csvCell, exportBaseName } from "./csv";

const A: Fighter = { id: "A", sex: "male", weighInKg: 70, heightCm: 175, gloveOz: 10 };
const B: Fighter = { id: "B", sex: "female", weighInKg: 60, heightCm: 165, gloveOz: 10 };
const step = (over: Partial<StrikeStep>): StrikeStep => ({
  attacker: "A",
  technique: "cross",
  side: "rear",
  target: "jaw",
  speedMps: 9.14,
  speedBasis: "research",
  defense: "none",
  ...over,
});

describe("CSV 내려받기", () => {
  const results = [
    buildStrikeResult(step({}), A, B, 0),
    buildStrikeResult(step({ technique: "knee", side: "rear", target: "abdomen", speedMps: 11 }), A, B, 0),
  ];
  const csv = buildCsv(results, { A, B });
  const lines = csv.replace("﻿", "").trim().split("\r\n");

  it("엑셀용 BOM으로 시작하고, 첫 줄은 설계서의 칸 순서", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(CSV_HEADER).toHaveLength(20);
  });

  it("타격마다 한 줄, 칸 수가 머리줄과 같다", () => {
    expect(lines).toHaveLength(3);
    // 의학적 판단에는 쉼표가 있을 수 있어 따옴표 안의 쉼표는 세지 않는다
    const cells = (line: string) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.filter((c) => c !== "").length;
    expect(cells(lines[1])).toBe(20);
  });

  it("무릎은 강도 지수 기록이 없어 빈칸이 아니라 '자료 없음'", () => {
    expect(lines[2]).toContain("자료 없음");
  });

  it("쉼표·따옴표가 든 칸은 따옴표로 감싼다", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("턱")).toBe("턱");
  });

  it("파일 이름: punchmeter_날짜_시각", () => {
    expect(exportBaseName(new Date(2026, 10, 23, 15, 30))).toBe("punchmeter_2026-11-23_1530");
  });
});
