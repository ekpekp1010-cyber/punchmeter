// 출처를 짧게 보여 주는 규칙 확인 (결과 칸·기술 칸)
import { describe, expect, it } from "vitest";
import { SOURCES } from "./sources";
import { shortCite } from "./cite";

describe("짧은 출처", () => {
  it("첫 저자 성 + 연도", () => {
    expect(shortCite("walilko2005")).toBe("Walilko 2005");
    expect(shortCite("deleva1996")).toBe("de Leva 1996");
    expect(shortCite("viano2005")).toBe("Viano 2005");
    expect(shortCite("praphanbundit2020")).toBe("Praphanbundit 2020");
  });

  it("모든 출처가 빈 이름 없이 줄여진다", () => {
    for (const id of Object.keys(SOURCES)) expect(shortCite(id)).toMatch(/^\S.* \d{4}$/);
  });
});
