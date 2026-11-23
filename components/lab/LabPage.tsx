"use client";
// Design Ref: §5.1 화면 구성 — 실험실 화면의 틀 (PLAN 작업 8·9·10)
// 왼쪽은 입력 칸(선수 정보는 FighterForm, 기술 고르기·연타·관절기는 이후 작업), 오른쪽은 3D 무대.
// 입력이 범위를 벗어나면 안내를 보이고, 3D는 마지막으로 올바랐던 값을 유지한다.

import { useState } from "react";
import FighterForm from "@/components/lab/FighterForm";
import Stage3D from "@/components/scene/Stage3D";
import { checkFighter, toDraft, type FighterCheck, type FighterDraft } from "@/lib/lab/fighterInput";
import type { Fighter, FighterId } from "@/lib/types";

/** 처음 화면의 선수 값 (입력 예시) */
const INITIAL: Record<FighterId, Fighter> = {
  A: { id: "A", sex: "male", weighInKg: 70, heightCm: 175, gloveOz: 10 },
  B: { id: "B", sex: "male", weighInKg: 70, heightCm: 175, gloveOz: 10 },
};

interface FighterState {
  draft: FighterDraft;
  check: FighterCheck;
  /** 마지막으로 검사를 통과한 값 (3D에 쓴다) */
  lastValid: Fighter;
}

function initialState(f: Fighter): FighterState {
  const draft = toDraft(f);
  return { draft, check: checkFighter(draft), lastValid: f };
}

export default function LabPage() {
  const [state, setState] = useState<Record<FighterId, FighterState>>(() => ({
    A: initialState(INITIAL.A),
    B: initialState(INITIAL.B),
  }));

  const change = (id: FighterId, draft: FighterDraft) =>
    setState((prev) => {
      const check = checkFighter(draft);
      return { ...prev, [id]: { draft, check, lastValid: check.fighter ?? prev[id].lastValid } };
    });

  /** 두 선수 모두 올바를 때만 재생·계산할 수 있다 (재생 버튼은 이후 작업) */
  const allValid = state.A.check.fighter !== null && state.B.check.fighter !== null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-5 py-3">
        <h1 className="text-lg font-semibold">펀치미터 · 타격 실험실</h1>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 lg:w-80">
          {(["A", "B"] as const).map((id) => (
            <FighterForm
              key={id}
              draft={state[id].draft}
              errors={state[id].check.errors}
              fighter={state[id].check.fighter}
              onChange={(d) => change(id, d)}
            />
          ))}
          {!allValid && (
            <p className="rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-300" role="status">
              안내가 있는 칸을 고치면 실험할 수 있어요. 3D는 마지막으로 올바른 값을 보여 줘요.
            </p>
          )}
          <p className="text-xs text-zinc-500">입력값은 서버로 보내지 않고 이 브라우저 안에서만 써요.</p>
        </aside>
        <section className="flex flex-1 flex-col gap-2">
          <Stage3D
            fighterA={state.A.lastValid}
            fighterB={state.B.lastValid}
            className="h-[60vh] min-h-[360px] w-full lg:h-[calc(100vh-8rem)]"
          />
          <p className="text-xs text-zinc-500">마우스로 끌어 시점을 돌리고, 휠로 확대·축소해요.</p>
        </section>
      </main>
    </div>
  );
}
