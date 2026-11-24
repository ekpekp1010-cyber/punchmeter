"use client";
// Design Ref: §5.3 Legend — 누적 충격 색 범례, 자료 없음 표시, 부위별 누적 비율 (PLAN 작업 18)

import { NO_DATA_COLOR, STEP_COLORS, STEP_LABELS } from "@/components/scene/loadColors";
import { bodyPartInfo } from "@/lib/reference";
import type { FighterId, PartLoad } from "@/lib/types";

interface Props {
  loads: Record<FighterId, PartLoad[]>;
}

export default function Legend({ loads }: Props) {
  const hitParts = (["A", "B"] as const).flatMap((id) =>
    loads[id].filter((l) => l.accumulatedForceN > 0).map((l) => ({ id, l })),
  );
  return (
    <section className="flex flex-col gap-2 py-3 text-xs" aria-label="누적 충격 색 범례">
      <h2 className="text-sm font-semibold">누적 충격 색 (한계 힘 대비, 리게인 기준)</h2>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {([1, 2, 3, 4, 5] as const).map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: STEP_COLORS[s] }} aria-hidden />
            {s}단계 {STEP_LABELS[s]}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: `repeating-linear-gradient(45deg, ${NO_DATA_COLOR} 0 2px, #444 2px 4px)` }}
            aria-hidden
          />
          자료 없음
        </li>
      </ul>
      {hitParts.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {hitParts.map(({ id, l }) => (
            <li key={`${id}-${l.part}`} className="flex items-center gap-2">
              <span className="w-12 text-zinc-500">선수 {id}</span>
              <span className="w-24">{bodyPartInfo(l.part).nameKo}</span>
              <span className="tabular-nums">
                {Math.round(l.accumulatedForceN).toLocaleString("ko-KR")} N /{" "}
                {l.thresholdN.value === null ? "자료 없음" : `${Math.round(l.thresholdN.value).toLocaleString("ko-KR")} N`}
                {l.thresholdN.basis === "estimated" ? "(추정)" : ""}
              </span>
              <span className="tabular-nums font-semibold">
                {l.ratioPct === null ? "자료 없음" : `${Math.round(l.ratioPct)}%${l.colorStep ? ` · ${l.colorStep}단계` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">재생하면 맞은 부위가 단계별 색으로 칠해지고, 연타는 닿을 때마다 쌓여요.</p>
      )}
    </section>
  );
}
