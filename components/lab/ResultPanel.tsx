"use client";
// Design Ref: §5.3 ResultPanel, §5.4 "결과 숫자마다 계체량/리게인, 추정 범위, 근거" (PLAN 작업 16)
// 계산은 lib/lab에서 하고, 이 부품은 받은 숫자를 보여 주기만 한다.

import { useState } from "react";
import { shortCite } from "@/lib/reference";
import { bodyPartInfo, techniqueInfo } from "@/lib/reference";
import type { ByWeight, Estimate, EstimateBasis, StrikeResult } from "@/lib/types";

export const BASIS_LABEL: Record<EstimateBasis, string> = {
  research: "연구값",
  userInput: "사용자 입력값",
  estimated: "추정",
  noData: "자료 없음",
};

const BASIS_COLOR: Record<EstimateBasis, string> = {
  research: "text-emerald-300",
  userInput: "text-sky-300",
  estimated: "text-amber-300",
  noData: "text-zinc-500",
};

/** 숫자 표시: 단위별 소수 자리 */
export function fmt(x: number | null | undefined, digits: number): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "자료 없음";
  return x.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function rangeText(e: Estimate, digits: number): string {
  if (e.low === undefined || e.high === undefined) return "—";
  return `${fmt(e.low, digits)}~${fmt(e.high, digits)}`;
}

interface RowProps {
  label: string;
  unit: string;
  value: ByWeight | Estimate;
  digits: number;
}

function Row({ label, unit, value, digits }: RowProps) {
  const byWeight = "weighIn" in value;
  const w = byWeight ? value.weighIn : value;
  const r = byWeight ? value.regain : null;
  const sources = [...new Set([...w.sourceIds, ...(r?.sourceIds ?? [])])];
  return (
    <tr className="border-t border-zinc-800 align-top">
      <th scope="row" className="py-1 pr-2 text-left font-normal text-zinc-400">
        {label}
        <span className="block text-[10px] text-zinc-500">{unit}</span>
      </th>
      <td className="py-1 pr-2 text-right tabular-nums">
        {fmt(w.value, digits)}
        <span className={`block text-[10px] ${BASIS_COLOR[w.basis]}`}>{BASIS_LABEL[w.basis]}</span>
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {r ? fmt(r.value, digits) : "—"}
        {r && <span className={`block text-[10px] ${BASIS_COLOR[r.basis]}`}>{BASIS_LABEL[r.basis]}</span>}
      </td>
      <td className="py-1 pr-2 text-right text-xs tabular-nums text-zinc-400">{rangeText(w, digits)}</td>
      <td className="py-1 text-[10px] leading-tight text-zinc-500">{sources.map(shortCite).join(" · ") || "—"}</td>
    </tr>
  );
}

interface Props {
  results: StrikeResult[];
  /** 지금까지 닿은 타격 수 (재생 중이면 아직 닿지 않은 타격은 흐리게) */
  contactedCount: number;
  selected: number;
  onSelect: (i: number) => void;
}

/** 요약 숫자 하나: 큰 숫자 + 단위 + 근거(색) + 추정 범위 */
function Stat({ label, unit, e, digits, big = false }: { label: string; unit: string; e: Estimate; digits: number; big?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] text-zinc-400">{label}</dt>
      <dd className={`font-display font-semibold leading-tight tabular-nums ${big ? "text-2xl text-ember" : "text-xl"}`}>
        {fmt(e.value, digits)}
        <span className="ml-1 font-sans text-[10px] font-normal text-zinc-500">{unit}</span>
      </dd>
      <dd className={`text-[10px] ${BASIS_COLOR[e.basis]}`}>
        {BASIS_LABEL[e.basis]}
        {e.low !== undefined && e.high !== undefined && <span className="text-zinc-500"> · {rangeText(e, digits)}</span>}
      </dd>
    </div>
  );
}

export default function ResultPanel({ results, contactedCount, selected, onSelect }: Props) {
  /** 상세(표·출처·리게인)를 펼쳤는가 */
  const [open, setOpen] = useState(false);
  if (results.length === 0) {
    return (
      <section className="py-3 text-sm text-zinc-500" aria-label="결과">
        재생하면 이곳에 속도·운동량·운동에너지·추정 충격력·강도 지수와 의학적 판단이 연구 근거와 함께 나와요.
      </section>
    );
  }
  const r = results[Math.min(selected, results.length - 1)];
  const info = techniqueInfo(r.step.technique);

  return (
    <section className="flex flex-col gap-2 py-3 text-sm" aria-label="결과">
      {results.length > 1 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="연타 순서">
          {results.map((x, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => onSelect(i)}
              className={`rounded px-2 py-0.5 text-xs ${i === selected ? "bg-ember text-zinc-950 font-medium" : "bg-zinc-800 text-zinc-300"} ${
                i >= contactedCount ? "opacity-50" : ""
              }`}
            >
              {i + 1}. {techniqueInfo(x.step.technique).nameKo}
            </button>
          ))}
        </div>
      )}
      <h2 className="font-semibold">
        선수 {r.step.attacker} → {r.step.attacker === "A" ? "B" : "A"} · {info.nameKo} ({r.step.side === "lead" ? "앞" : "뒷"}
        {info.limb === "arm" ? "손" : "발"}) · 노린 곳 {bodyPartInfo(r.step.target).nameKo}
        {r.outcome === "blocked" ? (
          <span className="ml-2 rounded bg-sky-900 px-1.5 py-0.5 text-xs text-sky-200">막힘 — {bodyPartInfo(r.hitPart).nameKo}에 닿음</span>
        ) : (
          <span className="ml-2 rounded bg-red-900 px-1.5 py-0.5 text-xs text-red-200">맞음</span>
        )}
      </h2>
      {/* 요약: 핵심 숫자 셋 (계체량 기준) — 숫자마다 근거를 붙인다 */}
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="추정 충격력" unit="N" e={r.force.weighIn} digits={0} big />
        <Stat label="강도 지수" unit="0~100" e={r.intensityIndex.weighIn} digits={0} />
        <Stat label="운동에너지" unit="J" e={r.energy.weighIn} digits={0} />
      </dl>
      <p className={`text-sm leading-relaxed text-zinc-200 ${open ? "hidden" : "line-clamp-2"}`}>
        <span className="text-zinc-500">의학적 판단 · </span>
        {r.medical.text}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="self-start rounded px-2 py-0.5 text-xs text-ember hover:bg-zinc-800"
      >
        {open ? "간단히 보기 ▴" : "자세히 보기 — 출처·추정 범위·리게인 ▾"}
      </button>
      {open && (
        <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="text-left font-normal">항목</th>
              <th className="text-right font-normal">계체량</th>
              <th className="text-right font-normal">리게인(추정)</th>
              <th className="text-right font-normal">추정 범위(계체량)</th>
              <th className="text-left font-normal">출처</th>
            </tr>
          </thead>
          <tbody>
            <Row label="속도" unit="m/s" value={r.speed} digits={2} />
            <Row label="운동량" unit="kg·m/s" value={r.momentum} digits={1} />
            <Row label="운동에너지" unit="J" value={r.energy} digits={0} />
            <Row label="추정 충격력" unit="N" value={r.force} digits={0} />
            <Row label="타격 강도 지수" unit="0~100" value={r.intensityIndex} digits={0} />
          </tbody>
        </table>
      </div>
      <div className="rounded bg-zinc-900 p-2">
        <h3 className="text-xs font-semibold text-zinc-300">
          의학적 판단 <span className="font-normal text-zinc-500">(리게인 기준 충격력{r.medical.estimated ? ", 한계 힘은 환산 추정값" : ""})</span>
        </h3>
        <p className="mt-1 text-sm leading-relaxed">{r.medical.text}</p>
        <p className="mt-1 text-[10px] text-zinc-500">근거: {r.medical.sourceIds.map(shortCite).join(" · ")}</p>
      </div>
      <p className="text-[10px] leading-relaxed text-zinc-500">
        초록 = 연구값 · 파랑 = 사용자 입력값 · 주황 = 추정 · 회색 = 자료 없음. 충격력은 연구 평균 접촉 시간(walilko2005)으로 환산한 추정이에요.
        이 숫자는 교육·실험용이며 의학적 진단이 아니에요.
      </p>
        </>
      )}
      {!open && <p className="text-[10px] text-zinc-500">계체량 기준 · 교육·실험용이며 의학적 진단이 아니에요.</p>}
    </section>
  );
}
