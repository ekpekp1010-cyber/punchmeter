"use client";
// Design Ref: §5.1 화면 구성 — 실험실 화면 (PLAN 작업 8~10, 14, 16, 17)
// 왼쪽: 선수 정보 → 기술 고르기 → 연타. 오른쪽: 3D 무대 + 재생 조절 + 결과.
// 입력이 범위를 벗어나면 안내를 보이고, 3D는 마지막으로 올바랐던 값을 유지한다.
// 계산(lib/lab)은 재생 버튼을 누를 때 한 번에 끝내고, 3D는 그 결과를 따라 재생만 한다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComboList from "@/components/lab/ComboList";
import ExportButtons from "@/components/lab/ExportButtons";
import FighterForm from "@/components/lab/FighterForm";
import JointLockPanel, { type JointLockDraft } from "@/components/lab/JointLockPanel";
import Legend from "@/components/lab/Legend";
import PrintReport from "@/components/lab/PrintReport";
import ResultPanel from "@/components/lab/ResultPanel";
import StrikePicker, { PLAYABLE, checkSpeed, type StrikeDraft } from "@/components/lab/StrikePicker";
import PlaybackBar, { type Rate } from "@/components/scene/PlaybackBar";
import Stage3D from "@/components/scene/Stage3D";
import type { Stage } from "@/components/scene/stage";
import { accumulateLoads, buildStrikeResult, isMoveStep, judgeJointLock, strikeIndexOf, strikesOf } from "@/lib/lab";
import { buildCsv, exportBaseName } from "@/lib/export/csv";
import { checkFighter, toDraft, type FighterCheck, type FighterDraft } from "@/lib/lab/fighterInput";
import type { ComboItem, Fighter, FighterId, PartLoad, StrikeResult } from "@/lib/types";

/** 처음 기술 칸 값 */
const INITIAL_STRIKE: StrikeDraft = {
  attacker: "A",
  technique: "cross",
  side: "rear",
  target: "jaw",
  speed: "9.14",
  defense: "none",
  move: null,
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
  /** 마지막으로 닿은 칸의 연타 목록 순서 (없으면 −1) */
  contactedAt: number;
  /** 마지막으로 닿은 타격이 노린 곳에 닿았는가 */
  reached: boolean;
}

/** 휴대폰 서랍 탭 */
type MobileTab = "fighters" | "strike" | "result" | "lock";
const MOBILE_TABS: [MobileTab, string][] = [
  ["fighters", "선수"],
  ["strike", "기술 · 연타"],
  ["result", "결과"],
  ["lock", "관절기"],
];

/** 무대 위에 뜨는 반투명 막 (넓은 화면). 휴대폰에서는 무대 아래 보통 흐름으로 놓인다 */
// (사용자 요청 2026-11-24) 막에 상자·테두리를 두지 않는다. 글자는 화면 가장자리에서 서서히 어두워지는 바탕 위에 놓여
// 무대와 한 화면으로 이어진다. 머리(이름·접기)는 고정이고 그 아래만 스크롤된다.
const OVERLAY_PANEL = "px-4 lg:absolute lg:top-20 lg:bottom-24 lg:z-10 lg:flex-col lg:px-0";
/** 막 안의 스크롤 영역: 얇은 구리빛 스크롤 막대(globals.css .forge-scroll), 위아래 끝은 흐리게 사라진다 */
const OVERLAY_SCROLL = "forge-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-3";
/** 접은 막을 다시 펴는 단추 (넓은 화면만) */
const OVERLAY_TOGGLE =
  "absolute top-20 z-10 hidden rounded-full bg-zinc-950/50 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-900/80 hover:text-zinc-100 lg:block";

/** 막 머리 (넓은 화면만): 이름 + 접기 */
function OverlayHead({ title, onClose, side }: { title: string; onClose: () => void; side: "left" | "right" }) {
  return (
    <div className="hidden items-center justify-between pb-1 pr-3 lg:flex">
      <span className="font-display text-[11px] uppercase tracking-[0.25em] text-ember/80">{title}</span>
      <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-100">
        {side === "left" ? "◂ 접기" : "접기 ▸"}
      </button>
    </div>
  );
}

/** 머리말 번호 캡션: 사용 순서 (제목, 설명) */
const HEADER_STEPS: [string, string][] = [
  ["선수 정보", "몸무게 · 키 · 글러브"],
  ["기술 · 연타", "부위 · 속도 · 수비 · 빽스텝"],
  ["3D 재생", "닿는 순간 진행 방향 화살표"],
  ["결과 · 근거", "연구 출처와 추정 범위"],
];

const IDLE: Playback = { playing: false, paused: false, current: -1, contacted: 0, contactedAt: -1, reached: true };

/** 기술 칸 → 연타 한 칸 (빽스텝은 움직임 칸, 타격은 속도가 올바를 때만) */
function toStep(d: StrikeDraft): ComboItem | null {
  if (d.move) return { kind: "move", fighter: d.attacker, move: d.move };
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
  const [combo, setCombo] = useState<ComboItem[]>([]);
  const [rate, setRate] = useState<Rate>(0.25);
  const [playback, setPlayback] = useState<Playback>(IDLE);
  const [results, setResults] = useState<StrikeResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [hasPlayed, setHasPlayed] = useState(false);
  /** 화면 배치: 휴대폰 서랍 탭, 넓은 화면의 왼쪽(입력)·오른쪽(결과) 막 펼침 */
  const [mobileTab, setMobileTab] = useState<MobileTab>("strike");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  /** 재생할 때의 선수 정보 (누적 계산은 이 값으로) */
  const [playedFighters, setPlayedFighters] = useState<Record<FighterId, Fighter> | null>(null);
  const stageRef = useRef<Stage | null>(null);
  /** 재생한 연타 목록 (닿은 칸 순서 → 결과 순서로 바꿀 때 쓴다. 빽스텝은 결과가 없다) */
  const playedItemsRef = useRef<ComboItem[]>([]);

  const onStageReady = useCallback((stage: Stage) => {
    stageRef.current = stage;
    // 개발 중 확인용: 브라우저 콘솔에서 무대를 살펴볼 수 있게 (배포 빌드에서는 빠짐)
    if (process.env.NODE_ENV === "development") (window as unknown as { __stage?: Stage }).__stage = stage;
    stage.setPlaybackEvents({
      onStart: (index) => setPlayback((p) => ({ ...p, playing: true, current: index })),
      onContact: (s, index) => {
        const resultIndex = strikeIndexOf(playedItemsRef.current, index);
        setPlayback((p) => ({ ...p, contacted: resultIndex + 1, contactedAt: index, reached: s.reached }));
        setSelected(resultIndex);
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
    // 빽스텝(움직임)은 계산 숫자가 없어 결과에서 빠진다
    setResults(strikesOf(steps).map((st) => buildStrikeResult(st, fighters[st.attacker], fighters[st.attacker === "A" ? "B" : "A"], 0)));
    setSelected(0);
    setPlayback({ ...IDLE, playing: true, current: 0 });
    setHasPlayed(true);
    setMobileTab("result"); // 휴대폰: 재생하면 결과 탭으로
    setRightOpen(true);
    setLockDraft((d) => ({ ...d, open: false }));
    setPlayedFighters(fighters);
    playedItemsRef.current = steps;
    stage.playSequence(
      steps.map((st) =>
        isMoveStep(st)
          ? st
          : { attacker: st.attacker, technique: st.technique, side: st.side, target: st.target, speedMps: st.speedMps, defense: st.defense },
      ),
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

  // 지금까지 닿은 타격으로 두 선수의 22곳 누적 충격 (PLAN 작업 18) — 리게인 기준 충격력
  const shownCount = playback.playing ? playback.contacted : results.length;
  const loads = useMemo<Record<FighterId, PartLoad[]>>(() => {
    const f = playedFighters ?? { A: state.A.lastValid, B: state.B.lastValid };
    const hits = results.slice(0, shownCount).map((r) => ({
      defender: (r.step.attacker === "A" ? "B" : "A") as FighterId,
      hitPart: r.hitPart,
      forceN: r.force.regain.value ?? 0,
    }));
    return { A: accumulateLoads(hits, f.A), B: accumulateLoads(hits, f.B) };
  }, [results, shownCount, playedFighters, state.A.lastValid, state.B.lastValid]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPartLoads("A", loads.A);
    stage.setPartLoads("B", loads.B);
  }, [loads]);

  // 관절기 (PLAN 작업 19): 판단은 lib/lab/jointLock.ts, 3D는 "3D로 보기"를 켰을 때만
  const [lockDraft, setLockDraft] = useState<JointLockDraft>({ open: false, attacker: "A", lock: "armbar", angleDeg: 20 });
  const lockJudgment = useMemo(() => {
    const defender = state[lockDraft.attacker === "A" ? "B" : "A"].lastValid;
    return judgeJointLock(lockDraft.attacker, lockDraft.lock, lockDraft.angleDeg, defender);
  }, [lockDraft, state]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.showJointLock(
      lockDraft.open
        ? { attacker: lockDraft.attacker, lock: lockDraft.lock, angleDeg: lockDraft.angleDeg, over: lockJudgment.overNormalDeg > 0 }
        : null,
    );
  }, [lockDraft, lockJudgment]);

  // 내려받기 (PLAN 작업 20·21): 모두 브라우저 안에서 만든다
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const canExport = results.length > 0 && playedFighters !== null && !playback.playing;
  const onCsv = () => {
    if (!playedFighters) return;
    const blob = new Blob([buildCsv(results, playedFighters)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportBaseName(new Date()) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const onPdf = () => {
    const name = exportBaseName(new Date());
    setSnapshot(stageRef.current?.snapshot() ?? null);
    setReportTitle(name);
    // 보고서가 그려진 뒤 인쇄 창을 연다. 저장 파일 이름은 문서 제목을 따른다
    window.setTimeout(() => {
      const before = document.title;
      document.title = name;
      window.print();
      document.title = before;
    }, 150);
  };

  const statusText = playback.playing
    ? playback.contactedAt === playback.current
      ? playback.reached
        ? "닿음 — 닿는 순간 끝점(주먹·발·무릎·팔꿈치) 속도가 정한 속도와 같아요"
        : "노린 곳까지 다 닿지 못했어요 — 두 선수 키 차이가 커서 몸이 겹치지 않는 거리에서는 닿지 않아요 (숫자 계산에는 영향 없음)"
      : `재생 중… ${steps.length > 1 ? `${playback.current + 1}/${steps.length}` : ""}`
    : "마우스로 끌어 시점을 돌리고, 휠로 확대·축소해요.";
  /** 휴대폰 서랍: 지금 탭이 아니면 숨기고, 넓은 화면(lg)에서는 늘 보인다 */
  const inTab = (t: MobileTab) => (mobileTab === t ? "" : "hidden lg:block");

  return (
    <>
    {/*
      화면 구성 (사용자 요청 2026-11-24): 3D 무대를 화면 가득 두고, 정보는 그 위에 반투명 막으로 띄운다.
      넓은 화면: 왼쪽 막 = 입력(선수·기술·연타·관절기), 오른쪽 막 = 결과(요약 → 펼치면 상세)·누적 색·내려받기,
      아래 가운데 = 재생 조절, 맨 아래 = 01~04 순서 캡션. 막은 접을 수 있다.
      휴대폰: 무대를 위에 두고 정보는 아래 서랍(탭)으로.
    */}
    <div className="relative bg-zinc-950 text-zinc-100 lg:h-svh lg:overflow-hidden print:hidden">
      {/* 3D 무대 (휴대폰: 위쪽 / 넓은 화면: 화면 가득) */}
      <div className="relative h-[56svh] min-h-[320px] lg:absolute lg:inset-0 lg:h-auto">
        <Stage3D fighterA={state.A.lastValid} fighterB={state.B.lastValid} onReady={onStageReady} className="absolute inset-0" frameless />
        {/* 은은한 구리 빛 + 위아래 어둡게 (글자가 잘 보이게) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_70%_at_50%_0%,rgba(197,121,75,0.14),transparent_70%),linear-gradient(to_bottom,rgba(18,17,16,0.7),transparent_18%,transparent_75%,rgba(18,17,16,0.75))]"
        />
        {/* 넓은 화면: 입력(왼쪽)·결과(오른쪽) 글자 뒤 바탕 — 상자 없이 화면 가장자리에서 가운데로 서서히 걷히는 어둠 */}
        {leftOpen && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[600px] bg-linear-to-r from-zinc-950/95 via-zinc-950/70 to-transparent lg:block" />
        )}
        {rightOpen && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[620px] bg-linear-to-l from-zinc-950/95 via-zinc-950/70 to-transparent lg:block" />
        )}
        {/* 넓은 화면: 맨 아래 한 줄(재생 조절·순서 캡션) 바탕 */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-32 bg-linear-to-t from-zinc-950 via-zinc-950/80 to-transparent lg:block" />
        {/* 제목 (무대 왼쪽 위에 작게) */}
        <header className="pointer-events-none absolute left-4 top-3 lg:left-6 lg:top-4">
          <h1>
            <span className="reveal">
              <span className="font-display text-2xl font-semibold uppercase leading-none tracking-tight lg:text-3xl">PunchMeter</span>
            </span>
            <span className="reveal mt-1">
              <span className="text-xs text-zinc-300" style={{ "--delay": "150ms" } as React.CSSProperties}>
                펀치미터 · 3D 타격 실험실
              </span>
            </span>
          </h1>
        </header>
        {/* 재생 조절 + 상태 (휴대폰: 무대 아래쪽에 떠 있음 / 넓은 화면: 맨 아래 한 줄 가운데, 상태 글은 그 위) */}
        <div className="absolute inset-x-3 bottom-3 z-20 flex flex-col items-center gap-1 lg:inset-x-auto lg:bottom-3 lg:left-1/2 lg:-translate-x-1/2 lg:flex-col-reverse">
          <div className="rounded-2xl bg-zinc-950/70 px-3 py-1.5 backdrop-blur-md lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
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
          </div>
          <p className="max-w-xl rounded bg-zinc-950/50 px-2 text-center text-[11px] text-zinc-300 lg:bg-transparent lg:text-zinc-400" role="status">
            {statusText}
          </p>
        </div>
        {/* 01~04 순서 캡션 (아주 넓은 화면: 맨 아래 한 줄의 양 끝, 재생 조절 좌우) */}
        {[HEADER_STEPS.slice(0, 2), HEADER_STEPS.slice(2)].map((group, g) => (
          <ol
            key={g}
            className={`pointer-events-none absolute bottom-4 hidden gap-6 xl:flex ${g === 0 ? "left-6" : "right-6"}`}
            aria-label={g === 0 ? "사용 순서 1~2" : "사용 순서 3~4"}
          >
            {group.map(([title, sub], j) => {
              const i = g * 2 + j;
              return (
                <li key={title} className="reveal" title={sub}>
                  <span className="flex items-center gap-2" style={{ "--delay": `${250 + i * 90}ms` } as React.CSSProperties}>
                    <span className="font-display text-lg font-light leading-none text-ember">{String(i + 1).padStart(2, "0")}</span>
                    <span className="border-l border-zinc-700 pl-2 text-[11px] leading-tight text-zinc-400">{title}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        ))}
        {/* 접은 막 다시 펴기 */}
        {!leftOpen && (
          <button type="button" onClick={() => setLeftOpen(true)} className={`${OVERLAY_TOGGLE} left-4`}>
            입력 펴기 ▸
          </button>
        )}
        {!rightOpen && (
          <button type="button" onClick={() => setRightOpen(true)} className={`${OVERLAY_TOGGLE} right-4`}>
            ◂ 결과 펴기
          </button>
        )}
      </div>

      {/* 휴대폰 서랍 탭 */}
      <nav className="sticky top-0 z-20 flex border-b border-zinc-800 bg-zinc-950/95 backdrop-blur lg:hidden" role="tablist" aria-label="정보">
        {MOBILE_TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={mobileTab === t}
            onClick={() => setMobileTab(t)}
            className={`flex-1 py-2.5 text-sm ${mobileTab === t ? "border-b-2 border-ember font-semibold text-zinc-100" : "text-zinc-400"}`}
          >
            {label}
            {t === "result" && results.length > 0 && <span className="ml-1 text-ember">●</span>}
          </button>
        ))}
      </nav>

      {/* 왼쪽 막: 입력 */}
      <aside className={`${OVERLAY_PANEL} lg:left-6 lg:w-[360px] ${leftOpen ? "lg:flex" : "lg:hidden"}`} aria-label="입력">
        <OverlayHead title="입력" onClose={() => setLeftOpen(false)} side="left" />
        <div className={OVERLAY_SCROLL}>
        <div className="divide-y divide-zinc-800/60">
          <div className={inTab("fighters")}>
            {(["A", "B"] as const).map((id) => (
              <FighterForm
                key={id}
                draft={state[id].draft}
                errors={state[id].check.errors}
                fighter={state[id].check.fighter}
                onChange={(d) => change(id, d)}
              />
            ))}
          </div>
          <div className={inTab("strike")}>
            <StrikePicker draft={strike} onChange={setStrike} />
            <ComboList steps={combo} onChange={setCombo} onAdd={() => currentStep && setCombo((c) => [...c, currentStep])} canAdd={currentStep !== null} current={playback.current} />
          </div>
          <div className={inTab("lock")}>
            <JointLockPanel draft={lockDraft} judgment={lockJudgment} onChange={setLockDraft} />
          </div>
        </div>
        {!allValid && (
          <p className="my-2 rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-300" role="status">
            안내가 있는 칸을 고치면 실험할 수 있어요. 3D는 마지막으로 올바른 값을 보여 줘요.
          </p>
        )}
        <p className="py-2 text-[11px] text-zinc-500">입력값은 서버로 보내지 않고 이 브라우저 안에서만 써요.</p>
        </div>
      </aside>

      {/* 오른쪽 막: 결과 */}
      <aside
        className={`${OVERLAY_PANEL} lg:right-6 lg:w-[380px] ${mobileTab === "result" ? "block" : "hidden"} ${rightOpen ? "lg:flex" : "lg:hidden"}`}
        aria-label="결과"
      >
        <OverlayHead title="결과" onClose={() => setRightOpen(false)} side="right" />
        <div className={OVERLAY_SCROLL}>
          <div className="divide-y divide-zinc-800/60">
            <ResultPanel results={results} contactedCount={shownCount} selected={selected} onSelect={setSelected} />
            <Legend loads={loads} />
            <div className="py-3">
              <ExportButtons disabled={!canExport} onCsv={onCsv} onPdf={onPdf} />
            </div>
          </div>
        </div>
      </aside>
    </div>
    <PrintReport title={reportTitle} fighters={playedFighters} results={results} loads={loads} snapshot={snapshot} />
    </>
  );
}
