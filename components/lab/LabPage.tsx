"use client";
// Design Ref: §5.1 화면 구성 — 실험실 화면의 틀 (PLAN 작업 8)
// 왼쪽은 입력 칸(선수 정보는 PLAN 작업 10, 기술 고르기·연타·관절기는 이후 작업), 오른쪽은 3D 무대.
// 지금은 무대 확인용으로 선수 성별만 고를 수 있다.

import { useState } from "react";
import Stage3D from "@/components/scene/Stage3D";
import type { FighterId, Sex } from "@/lib/types";

const SEX_LABEL: Record<Sex, string> = { male: "남", female: "여" };

export default function LabPage() {
  const [sex, setSex] = useState<Record<FighterId, Sex>>({ A: "male", B: "male" });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-5 py-3">
        <h1 className="text-lg font-semibold">펀치미터 · 타격 실험실</h1>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 lg:w-80">
          {(["A", "B"] as const).map((id) => (
            <section key={id} className="rounded-lg border border-zinc-800 p-3">
              <h2 className={`mb-2 text-sm font-semibold ${id === "A" ? "text-red-300" : "text-blue-300"}`}>
                선수 {id}
              </h2>
              <div className="flex gap-2 text-sm" role="radiogroup" aria-label={`선수 ${id} 성별`}>
                {(["male", "female"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={sex[id] === s}
                    onClick={() => setSex((prev) => ({ ...prev, [id]: s }))}
                    className={`rounded px-3 py-1 ${sex[id] === s ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
                  >
                    {SEX_LABEL[s]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">계체량·키·리치·글러브 입력은 다음 작업에서 추가돼요.</p>
            </section>
          ))}
        </aside>
        <section className="flex flex-1 flex-col gap-2">
          <Stage3D sexA={sex.A} sexB={sex.B} className="h-[60vh] min-h-[360px] w-full lg:h-[calc(100vh-8rem)]" />
          <p className="text-xs text-zinc-500">마우스로 끌어 시점을 돌리고, 휠로 확대·축소해요.</p>
        </section>
      </main>
    </div>
  );
}
