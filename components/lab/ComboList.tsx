"use client";
// Design Ref: §5.3 ComboList — 연타 목록, 순서 바꾸기·지우기·초기화 (PLAN 작업 17)

import { bodyPartInfo, techniqueInfo } from "@/lib/reference";
import type { StrikeStep } from "@/lib/types";

/** 연타에 넣을 수 있는 최대 개수 */
export const MAX_COMBO = 10;

interface Props {
  steps: StrikeStep[];
  onChange: (steps: StrikeStep[]) => void;
  onAdd: () => void;
  canAdd: boolean;
  /** 재생 중인 순서 (없으면 −1) */
  current: number;
}

export default function ComboList({ steps, onChange, onAdd, canAdd, current }: Props) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3 text-sm" aria-label="연타">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">연타</h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onAdd}
            disabled={!canAdd || steps.length >= MAX_COMBO}
            className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
          >
            + 지금 기술 추가
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={steps.length === 0}
            className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
          >
            초기화
          </button>
        </div>
      </div>
      {steps.length === 0 ? (
        <p className="text-xs text-zinc-500">
          비어 있으면 위에서 고른 기술 하나(단타)를 재생해요. 기술을 골라 &ldquo;+ 지금 기술 추가&rdquo;를 누르면 차례로 이어 재생해요 (최대 {MAX_COMBO}개).
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {steps.map((s, i) => (
            <li
              key={i}
              className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${i === current ? "bg-red-950 ring-1 ring-red-700" : "bg-zinc-900"}`}
            >
              <span className="w-4 tabular-nums text-zinc-500">{i + 1}</span>
              <span className="flex-1">
                {s.attacker}→{s.attacker === "A" ? "B" : "A"} {techniqueInfo(s.technique).nameKo} · {bodyPartInfo(s.target).nameKo} ·{" "}
                {s.speedMps.toFixed(2)} m/s{s.speedBasis === "userInput" ? "(입력)" : ""}
                {s.defense === "armBlock" ? " · 막음" : ""}
              </span>
              <button type="button" aria-label={`${i + 1}번 위로`} onClick={() => move(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                aria-label={`${i + 1}번 아래로`}
                onClick={() => move(i, 1)}
                disabled={i === steps.length - 1}
                className="px-1 disabled:opacity-30"
              >
                ↓
              </button>
              <button type="button" aria-label={`${i + 1}번 지우기`} onClick={() => onChange(steps.filter((_, k) => k !== i))} className="px-1 text-zinc-400 hover:text-red-400">
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
