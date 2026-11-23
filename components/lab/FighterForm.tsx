"use client";
// Design Ref: §5.3 FighterForm — 선수 정보 입력·검사 (PLAN 작업 10)
// 입력 칸 글자를 그대로 들고 있다가, 검사를 통과한 값만 위로 알린다 (lib/lab/fighterInput.ts).

import { useId } from "react";
import { GLOVE_OPTIONS, type FighterDraft, type FighterErrors } from "@/lib/lab/fighterInput";
import { MODEL_KEY, bodyShape, type ModelsJson } from "@/lib/motion/bodyShape";
import { regainKg } from "@/lib/physics";
import { MUSCLE_DENSITY } from "@/lib/reference";
import type { Fighter, GloveOz, Sex } from "@/lib/types";
import modelsJson from "@/public/models/models.json";

const MODELS = modelsJson as ModelsJson;
const SEX_LABEL: Record<Sex, string> = { male: "남", female: "여" };

/** 글러브 무게별 충격 흡수 근거 (lib/physics/impact.ts gloveForceFactor와 같은 규칙) */
function gloveNote(oz: GloveOz): string {
  if (oz === 0) return "맨손: 흡수 자료가 부족해 흡수 없이 계산해요";
  if (oz === 4) return "4oz(MMA): 흡수 자료가 부족해 흡수 없이 계산해요";
  if (oz === 8) return "8oz: 측정 자료가 없어 10oz 값을 빌려요 (추정)";
  return `${oz}oz: 같은 실험에서 무게별로 잰 값을 써요 (nakano2009)`;
}

interface Props {
  draft: FighterDraft;
  errors: FighterErrors;
  /** 검사를 통과한 선수 정보 (안내가 있으면 null) */
  fighter: Fighter | null;
  onChange: (draft: FighterDraft) => void;
}

interface FieldProps {
  label: string;
  unit: string;
  value: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  onChange: (v: string) => void;
}

function NumberField({ label, unit, value, placeholder, error, hint, onChange }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <span className="w-14 shrink-0 text-zinc-400">{label}</span>
        <input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={`w-24 rounded border bg-zinc-900 px-2 py-1 text-right tabular-nums outline-none focus:border-zinc-400 ${
            error ? "border-amber-500" : "border-zinc-700"
          }`}
        />
        <span className="text-zinc-400">{unit}</span>
      </label>
      {(error || hint) && (
        <p id={`${id}-msg`} className={`pl-16 text-xs ${error ? "text-amber-400" : "text-zinc-500"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export default function FighterForm({ draft, errors, fighter, onChange }: Props) {
  const set = (patch: Partial<FighterDraft>) => onChange({ ...draft, ...patch });
  const color = draft.id === "A" ? "text-red-300" : "text-blue-300";
  const regain = fighter ? regainKg(fighter.weighInKg) : null;
  const shape = fighter ? bodyShape(fighter, MODELS[MODEL_KEY[fighter.sex]]) : null;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3" aria-label={`선수 ${draft.id} 정보`}>
      <div className="flex items-center justify-between">
        <h2 className={`text-sm font-semibold ${color}`}>선수 {draft.id}</h2>
        <div className="flex gap-1 text-sm" role="radiogroup" aria-label={`선수 ${draft.id} 성별`}>
          {(["male", "female"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={draft.sex === s}
              onClick={() => set({ sex: s })}
              className={`rounded px-3 py-0.5 ${draft.sex === s ? "bg-ember text-zinc-950 font-medium" : "bg-zinc-800 text-zinc-300"}`}
            >
              {SEX_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <NumberField
        label="계체량"
        unit="kg"
        value={draft.weighIn}
        error={errors.weighIn}
        hint={regain !== null ? `리게인 추정 ${regain.toFixed(1)}kg (계체량 × 1.075)` : undefined}
        onChange={(v) => set({ weighIn: v })}
      />
      <NumberField label="키" unit="cm" value={draft.height} error={errors.height} onChange={(v) => set({ height: v })} />
      <NumberField
        label="리치"
        unit="cm"
        value={draft.reach}
        placeholder="선택"
        error={errors.reach}
        hint={draft.reach.trim() === "" ? "양팔을 벌린 길이. 비워 두면 체형 평균으로 봐요" : undefined}
        onChange={(v) => set({ reach: v })}
      />

      {/* 근밀도: 바꿀 수 없는 고정 칸 (lib/reference/segments.ts MUSCLE_DENSITY) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-14 shrink-0 text-zinc-400">근밀도</span>
          <output
            aria-label={`선수 ${draft.id} 근밀도`}
            className="w-24 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-right tabular-nums text-zinc-300"
          >
            {(MUSCLE_DENSITY.value as number).toFixed(2)}
          </output>
          <span className="text-zinc-400">{MUSCLE_DENSITY.unit}</span>
          <span className="rounded bg-zinc-800 px-1.5 text-xs text-zinc-400">고정</span>
        </div>
        <p className="pl-16 text-xs text-zinc-500">
          근육 조직 평균 (연구값, {MUSCLE_DENSITY.sourceIds.join("·")}). UFC 선수만 잰 자료는 없어 모든 선수에 같은
          값을 써요. 몸무게가 정해져 있으면 팔다리 무게가 그대로라 충격 숫자는 바뀌지 않아요.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1 text-sm" role="radiogroup" aria-label={`선수 ${draft.id} 글러브`}>
          <span className="w-14 shrink-0 text-zinc-400">글러브</span>
          {GLOVE_OPTIONS.map((oz) => (
            <button
              key={oz}
              type="button"
              role="radio"
              aria-checked={draft.gloveOz === oz}
              onClick={() => set({ gloveOz: oz })}
              className={`rounded px-2 py-0.5 tabular-nums ${
                draft.gloveOz === oz ? "bg-ember text-zinc-950 font-medium" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {oz === 0 ? "맨손" : `${oz}oz`}
            </button>
          ))}
        </div>
        <p className="pl-16 text-xs text-zinc-500">{gloveNote(draft.gloveOz)}</p>
      </div>

      {shape?.clamped && (
        <p className="text-xs text-zinc-500">
          3D 캐릭터는 체형 변형 한계가 있어 입력한 체격과 조금 달라 보일 수 있어요. 계산 숫자에는 영향이 없어요.
        </p>
      )}
    </section>
  );
}
