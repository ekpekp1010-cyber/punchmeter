"use client";
// Design Ref: §5.1 화면 구성 — 실험실 화면의 틀 (PLAN 작업 8·9·10)
// 왼쪽은 입력 칸(선수 정보는 FighterForm, 기술 고르기·연타·관절기는 이후 작업), 오른쪽은 3D 무대.
// 입력이 범위를 벗어나면 안내를 보이고, 3D는 마지막으로 올바랐던 값을 유지한다.

import { useCallback, useRef, useState } from "react";
import FighterForm from "@/components/lab/FighterForm";
import StrikePicker, { PLAYABLE, checkSpeed, type StrikeDraft } from "@/components/lab/StrikePicker";
import Stage3D from "@/components/scene/Stage3D";
import type { Stage } from "@/components/scene/stage";
import type { PunchId } from "@/lib/motion/strikeMotion";
import { checkFighter, toDraft, type FighterCheck, type FighterDraft } from "@/lib/lab/fighterInput";
import type { Fighter, FighterId } from "@/lib/types";

/** 처음 기술 칸 값 */
const INITIAL_STRIKE: StrikeDraft = {
  attacker: "A",
  technique: "cross",
  side: "rear",
  target: "jaw",
  speed: "9.14",
  defense: "none",
};

/** 지금은 느린 재생만 (재생 속도 고르기는 PLAN 작업 14) */
const PREVIEW_RATE = 0.25;

type PlayStatus = { kind: "idle" } | { kind: "playing"; contacted: boolean; reached: boolean };

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

  /** 두 선수 모두 올바를 때만 재생·계산할 수 있다 */
  const allValid = state.A.check.fighter !== null && state.B.check.fighter !== null;

  const [strike, setStrike] = useState<StrikeDraft>(INITIAL_STRIKE);
  const [play, setPlay] = useState<PlayStatus>({ kind: "idle" });
  const stageRef = useRef<Stage | null>(null);
  const onStageReady = useCallback((stage: Stage) => {
    stageRef.current = stage;
    // 개발 중 확인용: 브라우저 콘솔에서 무대를 살펴볼 수 있게 (배포 빌드에서는 빠짐)
    if (process.env.NODE_ENV === "development") (window as unknown as { __stage?: Stage }).__stage = stage;
    stage.setPlaybackEvents({
      onContact: (s) => setPlay({ kind: "playing", contacted: true, reached: s.reached }),
      onEnd: () => setPlay({ kind: "idle" }),
    });
  }, []);

  const speed = checkSpeed(strike);
  const canPlay = allValid && speed.speedMps !== null && PLAYABLE.includes(strike.technique);
  const onPlay = () => {
    const stage = stageRef.current;
    if (!stage || !canPlay || speed.speedMps === null) return;
    const started = stage.playPunch(
      {
        attacker: strike.attacker,
        technique: strike.technique as PunchId,
        side: strike.side,
        target: strike.target,
        speedMps: speed.speedMps,
        defense: strike.defense,
      },
      PREVIEW_RATE,
    );
    if (started) setPlay({ kind: "playing", contacted: false, reached: true });
  };

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
          <StrikePicker draft={strike} onChange={setStrike} />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onPlay}
              disabled={!canPlay}
              className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              ▶ 재생 (느리게 {PREVIEW_RATE}배)
            </button>
            {play.kind === "playing" && (
              <p className="text-xs text-zinc-400" role="status">
                {play.contacted
                  ? play.reached
                    ? "닿음 — 닿는 순간 주먹 속도가 정한 속도와 같아요"
                    : "주먹이 노린 곳까지 다 닿지 못했어요"
                  : "재생 중…"}
              </p>
            )}
          </div>
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
            onReady={onStageReady}
            className="h-[60vh] min-h-[360px] w-full lg:h-[calc(100vh-8rem)]"
          />
          <p className="text-xs text-zinc-500">마우스로 끌어 시점을 돌리고, 휠로 확대·축소해요.</p>
        </section>
      </main>
    </div>
  );
}
