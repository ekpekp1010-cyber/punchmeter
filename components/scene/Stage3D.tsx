"use client";
// Design Ref: §5.3 Stage3D, §6 오류 처리 — 3D 무대를 화면에 띄우는 부품 (PLAN 작업 8)
// 선수 성별이 바뀌면 그 성별 캐릭터로 바꿔 세운다. 무대가 준비되면 onReady로 Stage를 넘겨준다.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MODEL_KEY, bodyShape } from "@/lib/motion/bodyShape";
import type { Fighter } from "@/lib/types";
import { MODELS, Stage, webglAvailable } from "./stage";

const noSubscribe = () => () => {};

interface Props {
  /** 선수 A·B 정보. 성별로 캐릭터를 고르고, 키·체중·리치로 모양을 맞춘다 */
  fighterA: Fighter;
  fighterB: Fighter;
  /** 무대가 만들어지면 한 번 불린다 (동작 재생 등 다음 작업에서 사용) */
  onReady?: (stage: Stage) => void;
  className?: string;
  /** 테두리 없이 화면 가득 (선수 표시·시점 단추는 오른쪽 위에 모은다) */
  frameless?: boolean;
}

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

const NO_WEBGL: Status = { kind: "error", message: "이 브라우저에서는 3D를 볼 수 없어요. 숫자 결과는 그대로 볼 수 있어요." };

export default function Stage3D({ fighterA, fighterB, onReady, className, frameless = false }: Props) {
  const sexA = fighterA.sex;
  const sexB = fighterB.sex;
  const mountRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [loadStatus, setLoadStatus] = useState<Status>({ kind: "loading" });
  // 서버에서 그릴 때는 지원한다고 보고, 브라우저에서 실제로 확인한다
  const hasWebgl = useSyncExternalStore(noSubscribe, webglAvailable, () => true);
  const status = hasWebgl ? loadStatus : NO_WEBGL;
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // 무대 만들기 (한 번)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !webglAvailable()) return;
    const s = new Stage(mount);
    setStage(s);
    onReadyRef.current?.(s);
    return () => {
      s.dispose();
      setStage(null);
    };
  }, []);

  // 선수 세우기 (성별이 바뀔 때마다)
  useEffect(() => {
    if (!stage) return;
    let cancelled = false;
    Promise.all([stage.setFighter("A", sexA), stage.setFighter("B", sexB)])
      .then(() => {
        if (!cancelled) setLoadStatus({ kind: "ready" });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadStatus({
            kind: "error",
            message: `3D 캐릭터를 불러오지 못했어요 (${String(err)}). 숫자 결과는 3D 없이도 볼 수 있어요.`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stage, sexA, sexB]);

  // 체형·글러브 맞추기 (키·체중·리치·글러브가 바뀔 때마다, 캐릭터가 다 선 뒤에)
  useEffect(() => {
    if (!stage || loadStatus.kind !== "ready") return;
    for (const f of [fighterA, fighterB]) {
      if (stage.getFighter(f.id)?.sex !== f.sex) continue;
      stage.applyShape(f.id, bodyShape(f, MODELS[MODEL_KEY[f.sex]]));
      stage.setGlove(f.id, f.gloveOz);
    }
  }, [stage, loadStatus, fighterA, fighterB]);

  return (
    // frameless면 자리(absolute 등)는 부모가 className으로 정한다 (relative를 같이 주면 높이가 0이 된다)
    <div className={`overflow-hidden bg-[#161210] ${frameless ? "" : "relative rounded-lg border border-zinc-800"} ${className ?? ""}`}>
      <div ref={mountRef} className="absolute inset-0" />
      <div
        className={`pointer-events-none absolute flex gap-2 text-xs font-medium ${frameless ? "right-3 top-14 z-[5] lg:top-3" : "left-3 top-3"}`}
      >
        <span className="rounded bg-black/40 px-2 py-1 text-red-300">● 선수 A</span>
        <span className="rounded bg-black/40 px-2 py-1 text-blue-300">● 선수 B</span>
        {frameless && stage && (
          <button
            type="button"
            onClick={() => stage.resetView()}
            className="pointer-events-auto rounded bg-black/40 px-2 py-1 text-xs text-zinc-200 hover:bg-black/60"
          >
            시점 처음으로
          </button>
        )}
      </div>
      {!frameless && stage && (
        <button
          type="button"
          onClick={() => stage.resetView()}
          className="absolute right-3 top-3 rounded bg-black/40 px-2 py-1 text-xs text-zinc-200 hover:bg-black/60"
        >
          시점 처음으로
        </button>
      )}
      {status.kind === "loading" && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-300">캐릭터 불러오는 중…</p>
      )}
      {status.kind === "error" && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-amber-300">
          {status.message}
        </p>
      )}
    </div>
  );
}
