"use client";
// Design Ref: §5.3 JointLockPanel, §5.4 "관절기: 회전 화살표와 각도, 정상 범위 초과 ° 또는 부상 판단" (PLAN 작업 19)
// 판단은 lib/lab/jointLock.ts가 하고, 부상 기준 자료가 없으면 판단하지 않는다.

import { useId } from "react";
import type { JointLockJudgment } from "@/lib/lab/jointLock";
import { JOINT_LOCK_REFERENCE, shortCite } from "@/lib/reference";
import type { FighterId, JointLockId } from "@/lib/types";

export const LOCK_NAMES: Record<JointLockId, string> = {
  armbar: "암바 (팔꿈치 과신전)",
  kimura: "기무라 (어깨 안쪽 돌림)",
  americana: "아메리카나 (어깨 바깥쪽 돌림)",
  kneebar: "니바 (무릎 과신전)",
  heelHook: "힐훅 (정강이 안쪽 비틀기)",
  ankleLock: "앵클록 (발목 발바닥 굽힘)",
};

/** 각도 칸의 최대값(°) — 정상 범위·부상 기준보다 넉넉히 (그림용) */
export const LOCK_MAX_DEG: Record<JointLockId, number> = {
  armbar: 60,
  kimura: 150,
  americana: 170,
  kneebar: 60,
  heelHook: 90,
  ankleLock: 100,
};

export interface JointLockDraft {
  open: boolean;
  attacker: FighterId;
  lock: JointLockId;
  angleDeg: number;
}

interface Props {
  draft: JointLockDraft;
  judgment: JointLockJudgment | null;
  onChange: (d: JointLockDraft) => void;
}

const btn = (on: boolean) => `rounded px-2 py-0.5 ${on ? "bg-ember text-zinc-950 font-medium" : "bg-zinc-800 text-zinc-300"}`;

export default function JointLockPanel({ draft, judgment, onChange }: Props) {
  const ids = { lock: useId(), angle: useId() };
  const set = (patch: Partial<JointLockDraft>) => onChange({ ...draft, ...patch });
  const ref = JOINT_LOCK_REFERENCE[draft.lock];
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3 text-sm" aria-label="관절기">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">관절기</h2>
        <button type="button" onClick={() => set({ open: !draft.open })} className={btn(draft.open)} aria-pressed={draft.open}>
          {draft.open ? "관절기 보기 끄기" : "3D로 보기"}
        </button>
      </div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="거는 선수">
        <span className="w-14 shrink-0 text-zinc-400">거는 쪽</span>
        {(["A", "B"] as const).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={draft.attacker === id} onClick={() => set({ attacker: id })} className={btn(draft.attacker === id)}>
            선수 {id} → {id === "A" ? "B" : "A"}
          </button>
        ))}
      </div>
      <label htmlFor={ids.lock} className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-zinc-400">기술</span>
        <select
          id={ids.lock}
          value={draft.lock}
          onChange={(e) => {
            const lock = e.target.value as JointLockId;
            set({ lock, angleDeg: Math.min(draft.angleDeg, LOCK_MAX_DEG[lock]) });
          }}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        >
          {(Object.keys(LOCK_NAMES) as JointLockId[]).map((l) => (
            <option key={l} value={l}>
              {LOCK_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={ids.angle} className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-zinc-400">꺾는 각도</span>
        <input
          id={ids.angle}
          type="range"
          min={0}
          max={LOCK_MAX_DEG[draft.lock]}
          value={draft.angleDeg}
          onChange={(e) => set({ angleDeg: Number(e.target.value) })}
          className="flex-1"
        />
        <span className="w-12 text-right tabular-nums">{draft.angleDeg}°</span>
      </label>
      <p className="text-xs text-zinc-500">{ref.forcedMotion}</p>
      {judgment && (
        <div className={`rounded p-2 text-sm ${judgment.overInjury ? "bg-red-950" : judgment.overNormalDeg > 0 ? "bg-amber-950/50" : "bg-zinc-900"}`}>
          <p className="leading-relaxed">{judgment.text}</p>
          <p className="mt-1 text-[10px] text-zinc-500">근거: {judgment.sourceIds.map(shortCite).join(" · ") || "—"}</p>
        </div>
      )}
      <p className="text-[10px] text-zinc-500">
        3D는 당하는 선수의 팔다리만 그 자세로 놓고 관절을 꺾어 보여 줘요 (두 선수가 엉키는 바닥 자세는 만들지 않아요). 교육·실험용이며 의학적 진단이 아니에요.
      </p>
    </section>
  );
}
