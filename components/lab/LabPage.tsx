"use client";
// Design Ref: §5.1 화면 구성 — 실험실 화면의 틀 (PLAN 작업 8·9)
// 왼쪽은 입력 칸, 오른쪽은 3D 무대.
// 지금의 선수 칸은 체형 확인용 임시 칸이다. 범위 검사·안내·글러브를 갖춘 입력 화면은 PLAN 작업 10에서 만든다.

import { useState } from "react";
import Stage3D from "@/components/scene/Stage3D";
import type { Fighter, FighterId, Sex } from "@/lib/types";

const SEX_LABEL: Record<Sex, string> = { male: "남", female: "여" };

/** 처음 화면의 선수 값 (입력 예시) */
const INITIAL: Record<FighterId, Fighter> = {
  A: { id: "A", sex: "male", weighInKg: 70, heightCm: 175, gloveOz: 10 },
  B: { id: "B", sex: "male", weighInKg: 70, heightCm: 175, gloveOz: 10 },
};

interface SliderProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}

function Slider({ label, unit, min, max, value, onChange }: SliderProps) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-14 shrink-0 text-zinc-400">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-16 text-right tabular-nums">
        {value} {unit}
      </span>
    </label>
  );
}

export default function LabPage() {
  const [fighters, setFighters] = useState(INITIAL);
  const update = (id: FighterId, patch: Partial<Fighter>) =>
    setFighters((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-5 py-3">
        <h1 className="text-lg font-semibold">펀치미터 · 타격 실험실</h1>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 lg:w-80">
          {(["A", "B"] as const).map((id) => {
            const f = fighters[id];
            return (
              <section key={id} className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3">
                <h2 className={`text-sm font-semibold ${id === "A" ? "text-red-300" : "text-blue-300"}`}>선수 {id}</h2>
                <div className="flex gap-2 text-sm" role="radiogroup" aria-label={`선수 ${id} 성별`}>
                  {(["male", "female"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={f.sex === s}
                      onClick={() => update(id, { sex: s })}
                      className={`rounded px-3 py-1 ${f.sex === s ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
                    >
                      {SEX_LABEL[s]}
                    </button>
                  ))}
                </div>
                <Slider label="계체량" unit="kg" min={40} max={150} value={f.weighInKg} onChange={(v) => update(id, { weighInKg: v })} />
                <Slider label="키" unit="cm" min={140} max={220} value={f.heightCm} onChange={(v) => update(id, { heightCm: v })} />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.reachCm !== undefined}
                    onChange={(e) => update(id, { reachCm: e.target.checked ? f.heightCm : undefined })}
                  />
                  <span className="text-zinc-400">리치 입력</span>
                </label>
                {f.reachCm !== undefined && (
                  <Slider label="리치" unit="cm" min={130} max={240} value={f.reachCm} onChange={(v) => update(id, { reachCm: v })} />
                )}
              </section>
            );
          })}
          <p className="text-xs text-zinc-500">체형 확인용 임시 칸이에요. 글러브와 범위 안내는 다음 작업에서 추가돼요.</p>
        </aside>
        <section className="flex flex-1 flex-col gap-2">
          <Stage3D
            fighterA={fighters.A}
            fighterB={fighters.B}
            className="h-[60vh] min-h-[360px] w-full lg:h-[calc(100vh-8rem)]"
          />
          <p className="text-xs text-zinc-500">마우스로 끌어 시점을 돌리고, 휠로 확대·축소해요.</p>
        </section>
      </main>
    </div>
  );
}
