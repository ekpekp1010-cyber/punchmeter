// 출처를 화면·파일에 짧게 보여 주는 규칙 (예: "Dinu 2020", "de Leva 1996")
import { SOURCES } from "./sources";

/** 출처를 짧게: 첫 저자 성 + 연도 */
export function shortCite(id: string): string {
  const citation = SOURCES[id]?.citation;
  const year = id.match(/\d{4}/)?.[0] ?? "";
  if (!citation) return id;
  // "de Leva P (1996)…" → "de Leva", "Viano DC et al." → "Viano": 이니셜·et al. 앞까지가 성
  const words = citation.split(/[(,]/)[0].trim().split(/\s+/);
  const name: string[] = [];
  for (const w of words) {
    if (/^[A-Z]{1,3}\.?$/.test(w) || w === "et") break;
    name.push(w);
  }
  return `${name.join(" ") || words[0]} ${year}`.trim();
}
