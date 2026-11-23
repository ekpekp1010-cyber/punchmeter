"use client";
// Design Ref: §5.3 PlaybackBar, §5.4 "재생: 0.1·0.25·0.5배·원본, 일시정지, 다시 보기" (PLAN 작업 14)

export const RATES = [0.1, 0.25, 0.5, 1] as const;
export type Rate = (typeof RATES)[number];

interface Props {
  rate: Rate;
  playing: boolean;
  paused: boolean;
  canPlay: boolean;
  /** 다시 보기를 할 수 있는가 (한 번이라도 재생했는가) */
  canReplay: boolean;
  onPlay: () => void;
  onPauseToggle: () => void;
  onReplay: () => void;
  onRate: (r: Rate) => void;
}

const chip = (on: boolean) =>
  `rounded px-2 py-1 text-xs tabular-nums ${on ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`;

export default function PlaybackBar({ rate, playing, paused, canPlay, canReplay, onPlay, onPauseToggle, onReplay, onRate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="재생 조절">
      <button
        type="button"
        onClick={onPlay}
        disabled={!canPlay}
        className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
      >
        ▶ 재생
      </button>
      <button
        type="button"
        onClick={onPauseToggle}
        disabled={!playing}
        className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
      >
        {paused ? "▶ 이어서" : "⏸ 일시정지"}
      </button>
      <button
        type="button"
        onClick={onReplay}
        disabled={!canReplay}
        className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
      >
        ↺ 다시 보기
      </button>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="재생 속도">
        <span className="text-xs text-zinc-400">속도</span>
        {RATES.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={rate === r} onClick={() => onRate(r)} className={chip(rate === r)}>
            {r === 1 ? "원본" : `${r}×`}
          </button>
        ))}
      </div>
    </div>
  );
}
