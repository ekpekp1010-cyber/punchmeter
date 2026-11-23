// PLAN 작업 10: 선수 입력 칸 검사 (DESIGN §5.4 "계체량 40~150kg, 키 140~220cm 밖이면 안내")
import { describe, expect, it } from "vitest";
import { checkFighter, toDraft, type FighterDraft } from "./fighterInput";

const draft = (over: Partial<FighterDraft> = {}): FighterDraft => ({
  id: "A",
  sex: "male",
  weighIn: "70",
  height: "175",
  reach: "",
  gloveOz: 10,
  ...over,
});

describe("선수 입력 검사", () => {
  it("올바른 값이면 선수 정보가 나오고 안내가 없다", () => {
    const r = checkFighter(draft());
    expect(r.fighter).toEqual({ id: "A", sex: "male", weighInKg: 70, heightCm: 175, gloveOz: 10 });
    expect(r.errors).toEqual({});
  });

  it("경계값 40·150kg, 140·220cm는 받고 그 밖은 안내", () => {
    expect(checkFighter(draft({ weighIn: "40", height: "140" })).fighter).not.toBeNull();
    expect(checkFighter(draft({ weighIn: "150", height: "220" })).fighter).not.toBeNull();
    const r = checkFighter(draft({ weighIn: "39.9", height: "221" }));
    expect(r.fighter).toBeNull();
    expect(r.errors.weighIn).toBe("계체량은 40~150kg 사이로 넣어 주세요");
    expect(r.errors.height).toBe("키는 140~220cm 사이로 넣어 주세요");
  });

  it("빈칸·글자는 숫자로 넣으라고 안내", () => {
    const r = checkFighter(draft({ weighIn: "", height: "abc" }));
    expect(r.errors.weighIn).toBe("계체량을 숫자로 넣어 주세요 (40~150kg)");
    expect(r.errors.height).toBe("키를 숫자로 넣어 주세요 (140~220cm)");
  });

  it("쉼표 소수점도 받는다 (70,5kg)", () => {
    expect(checkFighter(draft({ weighIn: "70,5" })).fighter?.weighInKg).toBe(70.5);
  });

  it("리치는 비워 두면 없음, 넣으면 범위 검사", () => {
    expect(checkFighter(draft()).fighter?.reachCm).toBeUndefined();
    expect(checkFighter(draft({ reach: "182" })).fighter?.reachCm).toBe(182);
    expect(checkFighter(draft({ reach: "1800" })).errors.reach).toBeDefined();
  });

  it("선수 정보 ↔ 입력 칸이 서로 바뀐다", () => {
    const f = { id: "B" as const, sex: "female" as const, weighInKg: 57, heightCm: 163, reachCm: 165, gloveOz: 8 as const };
    expect(checkFighter(toDraft(f)).fighter).toEqual(f);
  });
});
