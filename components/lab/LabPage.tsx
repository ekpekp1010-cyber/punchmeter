"use client";
// Design Ref: §5.1 화면 구성 — 실험실 화면 (PLAN 작업 8~10, 14, 16, 17)
// 왼쪽: 선수 정보 → 기술 고르기 → 연타. 오른쪽: 3D 무대 + 재생 조절 + 결과.
// 입력이 범위를 벗어나면 안내를 보이고, 3D는 마지막으로 올바랐던 값을 유지한다.
// 계산(lib/lab)은 재생 버튼을 누를 때 한 번에 끝내고, 3D는 그 결과를 따라 재생만 한다.

import { useCallback, useMemo, useRef, useState } from "react";
import ComboList from "@/components/lab/ComboList";
import FighterForm from "@/components/lab/FighterForm";
import ResultPanel from "@/components/lab/ResultPanel";
import StrikePicker, { PLAYABLE, checkSpeed, type StrikeDraft } from "@/components/lab/StrikePicker";
import PlaybackBar, { type Rate } from "@/components/scene/PlaybackBar";
import Stage3D from "@/components/scene/Stage3D";
import type { Stage } from "@/components/scene/stage";
import { buildStrikeResult } from "@/lib/lab";
import { checkFighter, toDraft, type FighterCheck, type FighterDraft } from "@/lib/lab/fighterInput";
import type { Fighter, FighterId, StrikeResult, StrikeStep } from "@/lib/types";

/** 처음 기술 칸 값 */
const INITIAL_STRIKE: StrikeDraft = {
  attacker: "A",
  technique: "cross",
  side: "rear",
  target: "jaw",
  speed: "9.14",
  defense: "none",
};

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

/** 재생 상태 */
interface Playback {
  playing: boolean;
  paused: boolean;
  /** 재생 중인 순서 (없으면 −1) */
  current: number;
  /** 지금까지 닿은 타격 수 */
  contacted: number;
  /** 마지막으로 닿은 타격이 노린 곳에 닿았는가 */
  reached: boolean;
}

const IDLE: Playback = { playing: false, paused: false, current: -1, contacted: 0, reached: true };

/** 기술 칸 → 연타 한 칸 (속도가 올바를 때만) */
function toStep(d: StrikeDraft): StrikeStep | null {
  const speed = checkSpeed(d);
  if (speed.speedMps === null || !PLAYABLE.includes(d.technique)) return null;
  return {
    attacker: d.attacker,
    technique: d.technique,
    side: d.side,
    target: d.target,
    speedMps: speed.speedMps,
    speedBasis: speed.basis,
    defense: d.defense,
  };
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
  const [combo, setCombo] = useState<StrikeStep[]>([]);
  const [rate, setRate] = useState<Rate>(0.25);
  const [playback, setPlayback] = useState<Playback>(IDLE);
  const [results, setResults] = useState<StrikeResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [hasPlayed, setHasPlayed] = useState(false);
  const stageRef = useRef<Stage | null>(null);

  const onStageReady = useCallback((stage: Stage) => {
    stageRef.current = stage;
    // 개발 중 확인용: 브라우저 콘솔에서 무대를 살펴볼 수 있게 (배포 빌드에서는 빠짐)
    if (process.env.NODE_ENV === "development") (window as unknown as { __stage?: Stage }).__stage = stage;
    stage.setPlaybackEvents({
      onStart: (_s, index) => setPlayback((p) => ({ ...p, playing: true, current: index })),
      onContact: (s, index) => {
        setPlayback((p) => ({ ...p, contacted: index + 1, reached: s.reached }));
        setSelected(index);
      },
      onEnd: () => setPlayback((p) => ({ ...p, playing: false, paused: false, current: -1 })),
    });
  }, []);

  const currentStep = toStep(strike);
  const steps = useMemo(() => (combo.length > 0 ? combo : currentStep ? [currentStep] : []), [combo, currentStep]);
  const canPlay = allValid && steps.length > 0;

  const onPlay = () => {
    const stage = stageRef.current;
    const a = state.A.check.fighter;
    const b = state.B.check.fighter;
    if (!stage || !canPlay || !a || !b) return;
    const fighters = { A: a, B: b };
    // 숫자 계산은 재생 전에 한 번에 (닿는 시각은 3D 재생 계획이 정하므로 0으로 두고 표시하지 않는다)
    setResults(steps.map((st) => buildStrikeResult(st, fighters[st.attacker], fighters[st.attacker === "A" ? "B" : "A"], 0)));
    setSelected(0);
    setPlayback({ ...IDLE, playing: true, current: 0 });
    setHasPlayed(true);
    stage.playSequence(
      steps.map((st) => ({ attacker: st.attacker, technique: st.technique, side: st.side, target: st.target, speedMps: st.speedMps, defense: st.defense })),
      rate,
    );
  };
  const onPauseToggle = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPaused(!playback.paused);
    setPlayback((p) => ({ ...p, paused: !p.paused }));
  };
  const onReplay = () => {
    const stage = stageRef.current;
    if (!stage || !stage.replay()) return;
    setSelected(0);
    setPlayback({ ...IDLE, playing: true, current: 0 });
  };
  const onRate = (r: Rate) => {
    setRate(r);
    stageRef.current?.setRate(r);
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-5 py-3">
        <h1 className="text-lg font-semibold">펀치미터 · 타격 실험실</h1>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 lg:w-96 lg:shrink-0">
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
          <ComboList steps={combo} onChange={setCombo} onAdd={() => currentStep && setCombo((c) => [...c, currentStep])} canAdd={currentStep !== null} current={playback.current} />
          {!allValid && (
            <p className="rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-300" role="status">
              안내가 있는 칸을 고치면 실험할 수 있어요. 3D는 마지막으로 올바른 값을 보여 줘요.
            </p>
          )}
          <p className="text-xs text-zinc-500">입력값은 서버로 보내지 않고 이 브라우저 안에서만 써요.</p>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <Stage3D
            fighterA={state.A.lastValid}
            fighterB={state.B.lastValid}
            onReady={onStageReady}
            className="h-[55vh] min-h-[340px] w-full"
          />
          <PlaybackBar
            rate={rate}
            playing={playback.playing}
            paused={playback.paused}
            canPlay={canPlay}
            canReplay={hasPlayed && !playback.playing}
            onPlay={onPlay}
            onPauseToggle={onPauseToggle}
            onReplay={onReplay}
            onRate={onRate}
          />
          <p className="text-xs text-zinc-400" role="status">
            {playback.playing
              ? playback.contacted > playback.current
                ? playback.reached
                  ? "닿음 — 닿는 순간 끝점(주먹·발·무릎·팔꿈치) 속도가 정한 속도와 같아요"
                  : "노린 곳까지 다 닿지 못했어요 — 두 선수 키 차이가 커서 몸이 겹치지 않는 거리에서는 닿지 않아요 (숫자 계산에는 영향 없음)"
                : `재생 중… ${steps.length > 1 ? `${playback.current + 1}/${steps.length}` : ""}`
              : "마우스로 끌어 시점을 돌리고, 휠로 확대·축소해요."}
          </p>
          <ResultPanel results={results} contactedCount={playback.playing ? playback.contacted : results.length} selected={selected} onSelect={setSelected} />
        </section>
      </main>
    </div>
  );
}
