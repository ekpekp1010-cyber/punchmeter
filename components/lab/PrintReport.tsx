// Design Ref: §2.2 "PDF 파일: 결과 요약, 의학적 판단, 근거 연구, 마지막 누적 충격 그림" (PLAN 작업 21)
// 화면에는 숨겨 두었다가 인쇄(= 브라우저의 "PDF로 저장")할 때만 보이는 보고서.
// jsPDF 대신 브라우저 인쇄를 써서 한글 글꼴을 따로 내려받지 않는다 (2026-11-24 사용자 결정).

import { BASIS_LABEL, fmt, rangeText } from "@/components/lab/ResultPanel";
import { SOURCES, bodyPartInfo, shortCite, techniqueInfo } from "@/lib/reference";
import type { Fighter, FighterId, PartLoad, StrikeResult } from "@/lib/types";

interface Props {
  title: string;
  fighters: Record<FighterId, Fighter> | null;
  results: StrikeResult[];
  loads: Record<FighterId, PartLoad[]>;
  /** 마지막 누적 충격 3D 그림 */
  snapshot: string | null;
}

const SEX = { male: "남", female: "여" } as const;

export default function PrintReport({ title, fighters, results, loads, snapshot }: Props) {
  const allSources = [
    ...new Set(
      results.flatMap((r) => [
        ...r.speed.sourceIds,
        ...r.force.weighIn.sourceIds,
        ...r.force.regain.sourceIds,
        ...r.intensityIndex.weighIn.sourceIds,
        ...r.medical.sourceIds,
      ]),
    ),
  ];
  return (
    <article className="hidden bg-white p-8 text-[11pt] leading-relaxed text-black print:block">
      <h1 className="text-2xl font-bold">펀치미터 · 타격 실험 보고서</h1>
      <p className="text-sm text-zinc-600">{title} · 교육·실험용이며 의학적 진단이 아닙니다.</p>

      {fighters && (
        <section className="mt-4">
          <h2 className="text-lg font-semibold">선수</h2>
          <table className="mt-1 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left">선수</th>
                <th className="text-left">성별</th>
                <th className="text-right">계체량(kg)</th>
                <th className="text-right">리게인 추정(kg)</th>
                <th className="text-right">키(cm)</th>
                <th className="text-right">리치(cm)</th>
                <th className="text-right">글러브(oz)</th>
              </tr>
            </thead>
            <tbody>
              {(["A", "B"] as const).map((id) => {
                const f = fighters[id];
                return (
                  <tr key={id} className="border-b">
                    <td>{id}</td>
                    <td>{SEX[f.sex]}</td>
                    <td className="text-right">{f.weighInKg}</td>
                    <td className="text-right">{(f.weighInKg * 1.075).toFixed(1)}</td>
                    <td className="text-right">{f.heightCm}</td>
                    <td className="text-right">{f.reachCm ?? "입력 안 함"}</td>
                    <td className="text-right">{f.gloveOz === 0 ? "맨손" : f.gloveOz}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-4">
        <h2 className="text-lg font-semibold">타격 결과 (계체량 / 리게인 추정)</h2>
        {results.length === 0 ? (
          <p>재생한 타격이 없습니다.</p>
        ) : (
          <table className="mt-1 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left">#</th>
                <th className="text-left">기술 · 노린 곳 → 맞은 곳</th>
                <th className="text-right">속도 m/s</th>
                <th className="text-right">운동량 kg·m/s</th>
                <th className="text-right">에너지 J</th>
                <th className="text-right">충격력 N (범위)</th>
                <th className="text-right">강도 지수</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b align-top">
                  <td>{i + 1}</td>
                  <td>
                    {r.step.attacker}→{r.step.attacker === "A" ? "B" : "A"} {techniqueInfo(r.step.technique).nameKo} · {bodyPartInfo(r.step.target).nameKo} →{" "}
                    {bodyPartInfo(r.hitPart).nameKo}
                    {r.outcome === "blocked" ? " (막힘)" : ""}
                  </td>
                  <td className="text-right">
                    {fmt(r.speed.value, 2)} ({BASIS_LABEL[r.speed.basis]})
                  </td>
                  <td className="text-right">
                    {fmt(r.momentum.weighIn.value, 1)} / {fmt(r.momentum.regain.value, 1)}
                  </td>
                  <td className="text-right">
                    {fmt(r.energy.weighIn.value, 0)} / {fmt(r.energy.regain.value, 0)}
                  </td>
                  <td className="text-right">
                    {fmt(r.force.weighIn.value, 0)} / {fmt(r.force.regain.value, 0)} ({rangeText(r.force.weighIn, 0)})
                  </td>
                  <td className="text-right">
                    {fmt(r.intensityIndex.weighIn.value, 0)} / {fmt(r.intensityIndex.regain.value, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-1 text-xs text-zinc-600">
          충격력·강도 지수·리게인 기준 값은 모두 추정입니다. 충격력은 연구 평균 접촉 시간(walilko2005)으로 환산했습니다.
        </p>
      </section>

      {results.length > 0 && (
        <section className="mt-4">
          <h2 className="text-lg font-semibold">의학적 판단 (리게인 기준)</h2>
          <ol className="ml-5 list-decimal text-sm">
            {results.map((r, i) => (
              <li key={i}>
                {r.medical.text} <span className="text-xs text-zinc-600">[{r.medical.sourceIds.map(shortCite).join(", ")}]</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-4 break-inside-avoid">
        <h2 className="text-lg font-semibold">마지막 누적 충격</h2>
        {snapshot && (
          // eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 그림(data URL)이라 next/image를 쓸 수 없다
          <img src={snapshot} alt="마지막 누적 충격 3D 그림" className="mt-1 max-h-[90mm] w-full object-contain" />
        )}
        <ul className="mt-1 text-sm">
          {(["A", "B"] as const).flatMap((id) =>
            loads[id]
              .filter((l) => l.accumulatedForceN > 0)
              .map((l) => (
                <li key={`${id}-${l.part}`}>
                  선수 {id} · {bodyPartInfo(l.part).nameKo}: {Math.round(l.accumulatedForceN)} N / 한계 힘{" "}
                  {l.thresholdN.value === null ? "자료 없음" : `${Math.round(l.thresholdN.value)} N`}
                  {l.thresholdN.basis === "estimated" ? "(추정)" : ""} ={" "}
                  {l.ratioPct === null ? "자료 없음" : `${Math.round(l.ratioPct)}% (${l.colorStep}단계)`}
                </li>
              )),
          )}
        </ul>
      </section>

      {allSources.length > 0 && (
        <section className="mt-4 break-inside-avoid">
          <h2 className="text-lg font-semibold">근거 연구</h2>
          <ul className="text-xs">
            {allSources.map((id) => (
              <li key={id}>
                <strong>{shortCite(id)}</strong> — {SOURCES[id]?.citation ?? id}
                {SOURCES[id]?.doi ? ` doi:${SOURCES[id]?.doi}` : SOURCES[id]?.url ? ` ${SOURCES[id]?.url}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
