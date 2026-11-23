"use client";

// Design Ref: §5.1 진행 방향 화살표 — 영상을 느리게 재생하며 펀치·킥의 힘 진행 방향을 화살표로 보여 준다.
// PLAN 작업 4: 관절 찾기 시험 화면. 실제 서비스 화면이 아니라 정확도를 눈으로 확인하는 시험용이다.
//
// 흐름: 영상 장면 → [분석 작업자(Web Worker)] 관절 찾기 → 선수 추적 → 떨림 거르기 → 쌓아 두기
//       그리기는 따로, 모니터 새로고침마다 "지금 보이는 영상 장면"의 자세로 화살표를 구해 그린다.

import { useEffect, useRef, useState } from "react";
import { LANDMARK } from "@/lib/engine/landmarks";
import { PoseAnalyzer, type DetectResult } from "@/lib/engine/poseAnalyzer";
import { PoseTracker, type TrackedPerson } from "@/lib/engine/poseTracker";
import { PoseSmoother } from "@/lib/engine/smoothing";
import { PoseTimeline } from "@/lib/engine/poseTimeline";
import { ContactDetector, type StrikeContact } from "@/lib/engine/contact";
import { drawBodyFigure, PREDICTED_OPACITY } from "@/components/result/bodyFigure";
import { drawStrikeArrows, type FadingArrow } from "@/components/result/drawArrows";

/** 선수마다 다른 색 (선수 추적기가 정한 번호 순서: 0 = 빨강, 1 = 파랑. 영상 내내 바뀌지 않음) */
const PERSON_COLORS = ["#ef4444", "#3b82f6"];

/** 손목·발목: 타격 판정에 가장 중요한 관절이라 보이는 정도를 따로 집계한다 */
const KEY_JOINTS = [LANDMARK.leftWrist, LANDMARK.rightWrist, LANDMARK.leftAnkle, LANDMARK.rightAnkle];

/** 재생 속도 선택지 (슬로우 모션) */
const SPEEDS = [0.1, 0.25, 0.5, 1] as const;

/** 닿은 타격 화살표가 사라지기까지 남아 있는 시간 (영상 속 초). 느린 재생에서 눈으로 따라갈 수 있게 */
const ARROW_LINGER_SEC = 0.4;

/**
 * 화살표 위치
 * - overlay: 영상 위에 겹쳐 그린다
 * - side: 옆 칸에 사람 형체와 함께 그린다 (영상은 가리지 않음)
 */
type ArrowPlace = "overlay" | "side";

interface Stats {
  frames: number;
  /** 겹쳐서 못 찾은 선수를 예측으로 이어 그린 장면 수 */
  predictedFrames: number;
  withZero: number;
  withOne: number;
  withTwo: number;
  /** 장면 하나를 처리하는 데 걸린 평균 시간(ms) */
  avgMs: number;
  /** 손목·발목의 평균 보이는 정도 (0~1) */
  avgKeyVisibility: number;
  /** 분석이 밀려 건너뛴 장면 수 */
  dropped: number;
  /** 선수별 상대 몸에 닿은 타격 수 (0 = A, 1 = B) */
  counts: StrikeCounts[];
}

/** 선수 한 명의 닿은 타격 수 */
interface StrikeCounts {
  punch: number;
  kick: number;
  /** 팔에 막힌 타격 */
  blocked: number;
}

const EMPTY_COUNTS = (): StrikeCounts[] => [
  { punch: 0, kick: 0, blocked: 0 },
  { punch: 0, kick: 0, blocked: 0 },
];

const EMPTY_STATS: Stats = {
  counts: EMPTY_COUNTS(),
  frames: 0,
  predictedFrames: 0,
  withZero: 0,
  withOne: 0,
  withTwo: 0,
  avgMs: 0,
  avgKeyVisibility: 0,
  dropped: 0,
};

export default function PoseTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** 영상 위에 겹친 화살표 칸 */
  const overlayRef = useRef<HTMLCanvasElement>(null);
  /** 옆 칸 (사람 형체 + 화살표) */
  const sideRef = useRef<HTMLCanvasElement>(null);
  /** 화면 뒤에서 관절을 찾는 분석 작업자 */
  const analyzerRef = useRef<PoseAnalyzer | null>(null);
  /** 분석 회차 번호. 다시 시작하거나 영상을 바꾸면 늘려서 이전 회차의 반복을 멈춘다 */
  const sessionRef = useRef(0);
  const frameHandleRef = useRef<number | null>(null);
  /** 화면 그리기 반복(모니터 새로고침마다)의 번호 */
  const renderHandleRef = useRef<number | null>(null);
  const arrowPlaceRef = useRef<ArrowPlace>("overlay");
  /** 화살표 위치를 바꿨을 때 다시 그리라는 표시 */
  const redrawRef = useRef(false);

  const [status, setStatus] = useState("관절 찾기 도구를 불러오는 중…");
  const [ready, setReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [speed, setSpeed] = useState<number>(0.25);
  const [arrowPlace, setArrowPlace] = useState<ArrowPlace>("overlay");
  const [videoAspect, setVideoAspect] = useState(16 / 9);

  // 분석 작업자 준비 (관절 찾기 도구를 작업자 안에서 불러온다)
  useEffect(() => {
    let cancelled = false;
    const sessions = sessionRef;
    const analyzer = new PoseAnalyzer();
    analyzer
      .init()
      .then((delegate) => {
        if (cancelled) return;
        analyzerRef.current = analyzer;
        setReady(true);
        setStatus(`준비 완료 (${delegate === "GPU" ? "그래픽 카드" : "CPU"} 사용, 화면 뒤에서 분석). 영상을 골라 주세요.`);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(`관절 찾기 도구를 불러오지 못했어요: ${String(error)}`);
      });
    return () => {
      cancelled = true;
      sessions.current += 1; // 화면을 떠나면 분석 반복도 멈춘다
      analyzer.terminate();
      analyzerRef.current = null;
    };
  }, []);

  // 고른 영상의 임시 주소는 다른 영상을 고르거나 화면을 떠날 때 지운다
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  /** 화살표(와 옆 칸이면 사람 형체)를 그린다 */
  function draw(people: TrackedPerson[], arrows: FadingArrow[]) {
    const video = videoRef.current;
    if (arrowPlaceRef.current === "overlay") {
      const canvas = overlayRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !video) return;
      // 겹침 칸은 화면에 보이는 영상 크기에 맞춘다 (선명하게 그리려고 화면 배율만큼 키움)
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(video.clientWidth * dpr);
      const h = Math.round(video.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      drawStrikeArrows(ctx, arrows, w, h, PERSON_COLORS);
      return;
    }
    const canvas = sideRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const person of people) {
      const color = PERSON_COLORS[person.slot % PERSON_COLORS.length];
      const opacity = person.predicted ? PREDICTED_OPACITY : 1;
      drawBodyFigure(ctx, person.image, canvas.width, canvas.height, color, { opacity });
    }
    drawStrikeArrows(ctx, arrows, canvas.width, canvas.height, PERSON_COLORS);
  }

  /** 진행 중인 분석·그리기 반복을 멈춘다 */
  function stopLoop() {
    sessionRef.current += 1;
    const video = videoRef.current;
    if (video && frameHandleRef.current !== null) video.cancelVideoFrameCallback(frameHandleRef.current);
    frameHandleRef.current = null;
    if (renderHandleRef.current !== null) cancelAnimationFrame(renderHandleRef.current);
    renderHandleRef.current = null;
    analyzerRef.current?.clearPending();
    const overlay = overlayRef.current;
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
  }

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    stopLoop();
    setAnalyzing(false);
    // 영상은 이 브라우저 안에서만 쓰는 임시 주소로 연다 (서버로 보내지 않음)
    setVideoUrl(URL.createObjectURL(file));
    setStats(EMPTY_STATS);
    setStatus(`"${file.name}"을(를) 불러왔어요. [분석 시작]을 눌러 주세요.`);
  }

  function onVideoError() {
    setStatus(
      "이 브라우저에서 열 수 없는 영상 형식이에요. 휴대폰 카메라 설정을 '호환성 우선(H.264)'으로 바꿔 다시 찍어 주세요.",
    );
  }

  function onChangeSpeed(value: number) {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  }

  function onChangeArrowPlace(value: ArrowPlace) {
    setArrowPlace(value);
    arrowPlaceRef.current = value;
    const overlay = overlayRef.current;
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
    redrawRef.current = true;
  }

  function start() {
    const video = videoRef.current;
    const side = sideRef.current;
    const analyzer = analyzerRef.current;
    if (!video || !side || !analyzer) return;

    // 이전 회차가 돌고 있으면 먼저 멈춘다
    stopLoop();
    const session = sessionRef.current;

    side.width = video.videoWidth;
    side.height = video.videoHeight;
    const aspect = video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;

    // 처음부터 다시 분석하므로 추적·거르기도 새로 시작한다
    const tracker = new PoseTracker(aspect);
    const smoother = new PoseSmoother();
    const timeline = new PoseTimeline();
    const detector = new ContactDetector(aspect);
    /** 지금까지 찾은 "닿은 타격" (시간 순) */
    const contacts: StrikeContact[] = [];
    let counts = EMPTY_COUNTS();
    let lastResultTime: number | null = null;
    const skippedAtStart = analyzer.skipped;

    setStats(EMPTY_STATS);
    setAnalyzing(true);
    setStatus("분석 중… (느리게 재생하며 펀치·킥의 방향을 찾아요)");

    let frames = 0;
    let predictedFrames = 0;
    let withZero = 0;
    let withOne = 0;
    let withTwo = 0;
    let totalMs = 0;
    let visibilitySum = 0;
    let visibilityCount = 0;
    let lastPresented: number | null = null;
    let missedOnScreen = 0;

    const snapshot = (): Stats => ({
      frames,
      predictedFrames,
      withZero,
      withOne,
      withTwo,
      avgMs: frames ? totalMs / frames : 0,
      avgKeyVisibility: visibilityCount ? visibilitySum / visibilityCount : 0,
      dropped: missedOnScreen + (analyzer.skipped - skippedAtStart),
      counts: counts.map((c) => ({ ...c })),
    });

    /** 작업자가 장면 하나를 다 분석하면 불린다 */
    const onResult = (result: DetectResult) => {
      if (sessionRef.current !== session) return;
      if (result.error) setStatus(`이 장면을 분석하다 오류가 났어요: ${result.error}`);
      totalMs += result.ms;
      frames += 1;

      const detections = result.image.map((image, i) => ({ image, world: result.world[i] ?? [] }));
      if (detections.length === 0) withZero += 1;
      else if (detections.length === 1) withOne += 1;
      else withTwo += 1;
      for (const { image } of detections) {
        for (const index of KEY_JOINTS) {
          visibilitySum += image[index]?.visibility ?? 0;
          visibilityCount += 1;
        }
      }

      // 선수 2명으로 이어 붙이기(겹치면 예측, 잘린 다리 채움) → 떨림 거르기 → 쌓아 두기
      const tracked = tracker.update(detections, result.mediaTime);
      if (tracked.some((p) => p.predicted)) predictedFrames += 1;
      const smoothed = smoother.apply(tracked, result.mediaTime);
      timeline.push(result.mediaTime, smoothed, performance.now());

      // 상대 몸에 닿은 펀치·킥 찾기 (영상을 뒤로 감으면 처음부터 다시 센다)
      if (lastResultTime !== null && result.mediaTime < lastResultTime) {
        contacts.length = 0;
        counts = EMPTY_COUNTS();
      }
      lastResultTime = result.mediaTime;
      // 판정에는 떨림을 거르기 전 자세를 쓴다 (거르면 빠른 주먹이 끝까지 닿지 않은 것처럼 보일 수 있음)
      for (const contact of detector.push(result.mediaTime, tracked)) {
        contacts.push(contact);
        const c = counts[contact.slot];
        if (contact.outcome === "blocked") c.blocked += 1;
        else if (contact.limb === "punch") c.punch += 1;
        else c.kick += 1;
      }
      if (frames % 10 === 0) setStats(snapshot());
    };

    /** 영상 장면이 화면에 나올 때마다 불린다 */
    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (sessionRef.current !== session) return;
      // 멈췄다가 다시 재생해도 이어지도록 항상 다음 장면을 기다린다 (멈춘 동안은 호출되지 않음)
      frameHandleRef.current = video.requestVideoFrameCallback(onFrame);
      // 화면에 나온 장면 번호가 2 이상 건너뛰었으면 그만큼 분석 요청도 못 한 것
      if (lastPresented !== null && metadata.presentedFrames > lastPresented + 1) {
        missedOnScreen += metadata.presentedFrames - lastPresented - 1;
      }
      lastPresented = metadata.presentedFrames;

      // 지금 장면을 그림으로 떠서 분석 작업자에게 보낸다 (화면 쪽은 기다리지 않고 바로 다음 일을 한다)
      const mediaTime = metadata.mediaTime;
      createImageBitmap(video)
        .then((bitmap) => {
          if (sessionRef.current !== session) {
            bitmap.close();
            return;
          }
          analyzer.submit(bitmap, mediaTime, onResult);
        })
        .catch(() => {
          /* 영상이 바뀌는 순간 등 장면을 뜨지 못하면 이 장면만 건너뛴다 */
        });
    };

    video.onpause = () => {
      if (sessionRef.current !== session || video.ended) return;
      setStats(snapshot());
      setStatus("일시정지했어요. 다시 재생하면 이어서 분석해요.");
    };
    video.onplay = () => {
      if (sessionRef.current !== session) return;
      setStatus("분석 중… (느리게 재생하며 펀치·킥의 방향을 찾아요)");
    };
    video.onended = () => {
      if (sessionRef.current !== session) return;
      setStats(snapshot());
      setStatus("분석이 끝났어요. 다시 보려면 영상의 재생 버튼을 누르세요.");
    };

    video.currentTime = 0;
    video.playbackRate = speed;
    video.muted = true;

    // 그리기 반복: 모니터 새로고침마다 "지금 보이는 영상 장면"에 맞춰, 그 무렵 상대 몸에 닿은 타격만 화살표로 그린다.
    // 화살표는 닿은 순간부터 0.4초(영상 속 시간) 동안 흐려지며 남아, 느린 재생에서 눈으로 따라갈 수 있다.
    let lastDrawnTime: number | null = null;
    let lastVersion = -1;
    const render = () => {
      if (sessionRef.current !== session) return;
      renderHandleRef.current = requestAnimationFrame(render);
      const t = video.currentTime;
      if (!redrawRef.current && t === lastDrawnTime && timeline.version === lastVersion) return; // 바뀐 게 없으면 건너뜀
      redrawRef.current = false;
      lastDrawnTime = t;
      lastVersion = timeline.version;

      // 영상이 분석보다 조금 앞서 있으면 가장 최근에 분석한 장면 기준으로 본다
      const tEff = Math.min(t, timeline.lastTime() ?? t);
      const people = timeline.sampleAt(tEff);
      const shown: FadingArrow[] = [];
      for (const c of contacts) {
        const age = t - c.t;
        if (age >= 0 && age <= ARROW_LINGER_SEC) shown.push({ ...c, alpha: 1 - age / ARROW_LINGER_SEC });
      }
      draw(people, shown);
    };

    frameHandleRef.current = video.requestVideoFrameCallback(onFrame);
    renderHandleRef.current = requestAnimationFrame(render);
    void video.play();
  }

  const pct = (n: number) => (stats.frames ? `${Math.round((n / stats.frames) * 100)}%` : "-");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">펀치·킥 진행 방향 시험 (PLAN 작업 4)</h1>
      <p className="text-sm text-gray-600">
        영상은 이 브라우저 안에서만 처리되고 서버로 보내지 않아요. 처음 한 번은 관절 찾기 모델(약 9.4MB)을 내려받아요.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept="video/*" onChange={onPickFile} disabled={!ready} />
        <button
          type="button"
          onClick={start}
          disabled={!ready || !videoUrl}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        >
          {analyzing ? "처음부터 다시 분석" : "분석 시작"}
        </button>
        <label className="flex items-center gap-1 text-sm">
          재생 속도
          <select value={speed} onChange={(e) => onChangeSpeed(Number(e.target.value))} className="rounded border px-2 py-1">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}배{s === 1 ? " (원본 속도)" : " (슬로우)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          화살표 위치
          <select
            value={arrowPlace}
            onChange={(e) => onChangeArrowPlace(e.target.value as ArrowPlace)}
            className="rounded border px-2 py-1"
          >
            <option value="overlay">영상 위에 겹쳐</option>
            <option value="side">옆 칸에 (사람 형체와 함께)</option>
          </select>
        </label>
      </div>
      <p className="text-sm">{status}</p>
      <p className="text-xs text-gray-500">
        화살표 = 상대 몸에 닿은 펀치·킥만, 닿기 직전 진행 방향으로 표시해요 (팔에 막히면 점선 「막힘」). 빠를수록 길고 굵어요 (공개 기록의 펀치 속도 9.14 m/s에서
        가장 큼). 색: 빨강 = 선수 A, 파랑 = 선수 B.
      </p>

      <div className={`grid grid-cols-1 gap-4 ${arrowPlace === "side" ? "md:grid-cols-2" : ""}`}>
        <div>
          <h2 className="mb-1 font-semibold">영상 (슬로우 모션)</h2>
          {videoUrl ? (
            <div className="relative">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                playsInline
                onError={onVideoError}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoHeight > 0) setVideoAspect(v.videoWidth / v.videoHeight);
                }}
                className="w-full rounded bg-black"
              />
              {/* 영상 위 화살표 칸: 마우스 클릭은 아래 영상(재생 버튼 등)으로 통과시킨다 */}
              <canvas
                ref={overlayRef}
                className={`pointer-events-none absolute left-0 top-0 h-full w-full ${arrowPlace === "overlay" ? "" : "hidden"}`}
              />
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded bg-gray-100 text-gray-500">영상을 골라 주세요</div>
          )}
        </div>
        <div className={arrowPlace === "side" ? "" : "hidden"}>
          <h2 className="mb-1 font-semibold">진행 방향 (사람 형체 + 화살표)</h2>
          <canvas ref={sideRef} style={{ aspectRatio: videoAspect }} className="w-full rounded bg-gray-900" />
        </div>
      </div>

      <table className="w-full max-w-xl text-sm">
        <tbody>
          {(["A (빨강)", "B (파랑)"] as const).map((name, slot) => (
            <tr key={name} className="font-semibold">
              <td className="py-1">선수 {name}: 상대 몸에 닿은 타격</td>
              <td>
                펀치 {stats.counts[slot].punch} · 킥 {stats.counts[slot].kick} · 막힘 {stats.counts[slot].blocked}
              </td>
            </tr>
          ))}
          <tr><td className="py-1 text-gray-600">분석한 장면 수</td><td>{stats.frames}</td></tr>
          <tr><td className="py-1 text-gray-600">2명 이상 찾은 장면</td><td>{stats.withTwo} ({pct(stats.withTwo)})</td></tr>
          <tr><td className="py-1 text-gray-600">1명만 찾은 장면</td><td>{stats.withOne} ({pct(stats.withOne)})</td></tr>
          <tr><td className="py-1 text-gray-600">아무도 못 찾은 장면</td><td>{stats.withZero} ({pct(stats.withZero)})</td></tr>
          <tr>
            <td className="py-1 text-gray-600">겹쳐서 못 찾은 선수가 있던 장면 (이때는 화살표를 그리지 않음)</td>
            <td>{stats.predictedFrames} ({pct(stats.predictedFrames)})</td>
          </tr>
          <tr><td className="py-1 text-gray-600">손목·발목 평균 보이는 정도 (0~1)</td><td>{stats.avgKeyVisibility.toFixed(2)}</td></tr>
          <tr><td className="py-1 text-gray-600">장면 하나 처리 시간 (화면 뒤 작업자)</td><td>{stats.avgMs.toFixed(1)} ms</td></tr>
          <tr><td className="py-1 text-gray-600">분석이 밀려 건너뛴 장면</td><td>{stats.dropped}</td></tr>
        </tbody>
      </table>
    </main>
  );
}
