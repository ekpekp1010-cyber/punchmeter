"use client";
// Design Ref: §5.3 StrikePicker, §5.4 — 기술·앞뒤·노릴 부위·속도·수비 고르기 (PLAN 작업 11에서 시작)
// - 노릴 부위는 그 기술로 닿을 수 있는 곳만 보인다
// - 속도는 연구 기본값·범위 안에서 조절하고 출처를 보인다. 자료가 없으면 "자료 없음 — 직접 입력", 넣은 값은 "사용자 입력값"

import { useId } from "react";
import { BODY_PARTS, SOURCES, TECHNIQUES, bodyPartInfo, sideCanTarget, techniqueInfo } from "@/lib/reference";
import type { Defense, FighterId, StrikeSide, TechniqueId } from "@/lib/types";

/** 3D로 재생할 수 있는 기술 (PLAN 작업 11: 펀치, 작업 12: 킥·팔꿈치·무릎) */
export const PLAYABLE: TechniqueId[] = TECHNIQUES.map((t) => t.id);

export interface StrikeDraft {
  attacker: FighterId;
  technique: TechniqueId;
  side: StrikeSide;
  target: (typeof BODY_PARTS)[number]["id"];
  /** 속도 칸 글자 */
  speed: string;
  defense: Defense;
}

/** 그 기술·손으로 노릴 수 있는 부위 */
export function targetsFor(technique: TechniqueId, side: StrikeSide) {
  return techniqueInfo(technique).targets.filter((p) => sideCanTarget(technique, side, p));
}

/** 부위가 그 기술·손으로 칠 수 없으면 칠 수 있는 첫 부위로 바꾼다 */
function fixTarget(d: StrikeDraft): StrikeDraft {
  const allowed = targetsFor(d.technique, d.side);
  return allowed.includes(d.target) ? d : { ...d, target: allowed[0] };
}

/** 기술을 바꾸면 앞뒤·부위·속도를 그 기술에 맞춘다 */
export function draftForTechnique(prev: StrikeDraft, technique: TechniqueId): StrikeDraft {
  const info = techniqueInfo(technique);
  const side: StrikeSide = technique === "jab" ? "lead" : technique === "cross" ? "rear" : prev.side;
  return fixTarget({ ...prev, technique, side, speed: info.speed ? String(info.speed.defaultMps) : "" });
}

/** 속도 칸 검사: 연구 범위 안이면 연구값, 자료 없는 기술은 사용자 입력값 */
export function checkSpeed(d: StrikeDraft): { speedMps: number | null; basis: "research" | "userInput"; error?: string } {
  const info = techniqueInfo(d.technique);
  const n = Number(d.speed.trim().replace(",", "."));
  const basis = info.speed ? "research" : "userInput";
  if (d.speed.trim() === "" || !Number.isFinite(n) || n <= 0) {
    return { speedMps: null, basis, error: info.speed ? "속도를 숫자로 넣어 주세요" : "이 기술은 연구 속도 자료가 없어요. 속도를 직접 넣어 주세요" };
  }
  if (info.speed) {
    const [lo, hi] = info.speed.rangeMps;
    if (n < lo || n > hi) return { speedMps: null, basis, error: `연구 범위(${lo}~${hi} m/s) 안에서 골라 주세요` };
  }
  return { speedMps: n, basis };
}

/** 출처를 짧게: 첫 저자 성 + 연도 (예: "Dinu 2020") */
export function shortCite(id: string): string {
  const citation = SOURCES[id]?.citation;
  const year = id.match(/\d{4}/)?.[0] ?? "";
  if (!citation) return id;
  const firstAuthor = citation.split(/[ ,(]/)[0];
  return `${firstAuthor} ${year}`.trim();
}

interface Props {
  draft: StrikeDraft;
  onChange: (d: StrikeDraft) => void;
}

const btn = (on: boolean) => `rounded px-2 py-0.5 ${on ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`;

export default function StrikePicker({ draft, onChange }: Props) {
  const ids = { target: useId(), speed: useId() };
  const info = techniqueInfo(draft.technique);
  const speed = checkSpeed(draft);
  const set = (patch: Partial<StrikeDraft>) => onChange({ ...draft, ...patch });
  const fixedSide = draft.technique === "jab" || draft.technique === "cross";

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3 text-sm" aria-label="기술 고르기">
      <h2 className="text-sm font-semibold">기술</h2>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="때리는 선수">
        <span className="w-14 shrink-0 text-zinc-400">공격</span>
        {(["A", "B"] as const).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={draft.attacker === id} onClick={() => set({ attacker: id })} className={btn(draft.attacker === id)}>
            선수 {id} → {id === "A" ? "B" : "A"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="기술">
        {TECHNIQUES.map((t) => {
          const playable = PLAYABLE.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={draft.technique === t.id}
              disabled={!playable}
              title={playable ? undefined : "3D 동작은 다음 작업에서 추가돼요"}
              onClick={() => onChange(draftForTechnique(draft, t.id))}
              className={`${btn(draft.technique === t.id)} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {t.nameKo}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="앞손 뒷손">
        <span className="w-14 shrink-0 text-zinc-400">{info.limb === "arm" ? "손" : "발"}</span>
        {(["lead", "rear"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={draft.side === s}
            disabled={fixedSide && draft.side !== s}
            onClick={() => onChange(fixTarget({ ...draft, side: s }))}
            className={`${btn(draft.side === s)} disabled:opacity-40`}
          >
            {s === "lead" ? (info.limb === "arm" ? "앞손(왼)" : "앞발(왼)") : info.limb === "arm" ? "뒷손(오른)" : "뒷발(오른)"}
          </button>
        ))}
      </div>

      <label htmlFor={ids.target} className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-zinc-400">노릴 곳</span>
        <select
          id={ids.target}
          value={draft.target}
          onChange={(e) => set({ target: e.target.value as StrikeDraft["target"] })}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        >
          {targetsFor(draft.technique, draft.side).map((p) => (
            <option key={p} value={p}>
              {bodyPartInfo(p).nameKo}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <label htmlFor={ids.speed} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-zinc-400">속도</span>
          {info.speed ? (
            <input
              id={ids.speed}
              type="range"
              min={info.speed.rangeMps[0]}
              max={info.speed.rangeMps[1]}
              step={0.01}
              value={speed.speedMps ?? info.speed.defaultMps}
              onChange={(e) => set({ speed: e.target.value })}
              className="flex-1"
            />
          ) : (
            <input
              id={ids.speed}
              inputMode="decimal"
              value={draft.speed}
              placeholder="직접 입력"
              onChange={(e) => set({ speed: e.target.value })}
              className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right"
            />
          )}
          <span className="w-20 text-right tabular-nums">{speed.speedMps !== null ? `${speed.speedMps.toFixed(2)} m/s` : "—"}</span>
        </label>
        <p className="pl-16 text-xs text-zinc-500">
          {info.speed ? (
            <>
              연구값 · 기본 {info.speed.defaultMps} m/s, 범위 {info.speed.rangeMps[0]}~{info.speed.rangeMps[1]} m/s ·{" "}
              {info.speed.sourceIds.map(shortCite).join(" · ")}
              {info.speed.confidence === "low" && " (믿음 낮음)"}
            </>
          ) : (
            <>자료 없음 — 직접 입력 · 넣은 값은 &ldquo;사용자 입력값&rdquo;으로 표시돼요</>
          )}
        </p>
        {speed.error && <p className="pl-16 text-xs text-amber-400">{speed.error}</p>}
      </div>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="수비">
        <span className="w-14 shrink-0 text-zinc-400">수비</span>
        {(["none", "armBlock"] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={draft.defense === d} onClick={() => set({ defense: d })} className={btn(draft.defense === d)}>
            {d === "none" ? "맞음" : info.blockedBy === "shin" ? "정강이로 막음" : "팔로 막음"}
          </button>
        ))}
      </div>
    </section>
  );
}
