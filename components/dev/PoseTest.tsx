"use client";

// Design Ref: §5.1 화면 구성 — 원본 영상 옆 칸에 사람 형체를 따로 그린다 (영상 위에 겹쳐 그리지 않음)
// PLAN 작업 4: 관절 찾기 시험 화면. 실제 서비스 화면이 아니라 정확도를 눈으로 확인하는 시험용이다.
//
// 흐름: 영상 장면 → [분석 작업자(Web Worker)] 관절 찾기 → 선수 추적 → 떨림 거르기 → 원근으로 3D 배치 → 쌓아 두기
//       화면 그리기는 따로, 모니터 새로고침마다 쌓아 둔 장면 사이를 채워 부드럽게 그린다.

import { useEffect, useRef, useState } from "react";
import { LANDMARK } from "@/lib/engine/landmarks";
import { PoseAnalyzer, type DetectResult } from "@/lib/engine/poseAnalyzer";
import { PoseTracker, type TrackedPerson } from "@/lib/engine/poseTracker";
import { PoseSmoother } from "@/lib/engine/smoothing";
import { PoseTimeline } from "@/lib/engine/poseTimeline";
import {
  CAMERA_PRESETS,
  CameraPlacer,
  focalInScreenHeights,
  verticalFovDeg,
  type CameraPresetId,
} from "@/lib/engine/cameraModel";
import { drawBodyFigure, drawSkeleton, PREDICTED_OPACITY } from "@/components/result/bodyFigure";
import { Figure3DScene } from "@/components/result/bodyFigure3D";

/** 선수마다 다른 색 (선수 추적기가 정한 번호 순서: 0 = 빨강, 1 = 파랑. 영상 내내 바뀌지 않음) */
const PERSON_COLORS = ["#ef4444", "#3b82f6"];

/** 손목·발목: 타격 판정에 가장 중요한 관절이라 보이는 정도를 따로 집계한다 */
const KEY_JOINTS = [LANDMARK.leftWrist, LANDMARK.rightWrist, LANDMARK.leftAnkle, LANDMARK.rightAnkle];

/** 재생 속도 선택지 (느릴수록 장면을 덜 놓친다) */
const SPEEDS = [0.25, 0.5, 1] as const;

type ViewMode = "3d" | "figure" | "joints";

interface Stats {
  frames: number;
  /** 겹쳐서 못 찾은 선수를 예측으로 이어 그린 장면 수 */
  predictedFrames: number;
  /** 화면 밖·안 보이는 다리를 채워 그린 장면 수 */
  legFilledFrames: number;
  withZero: number;
  withOne: number;
  withTwo: number;
  /** 장면 하나를 처리하는 데 걸린 평균 시간(ms) */
  avgMs: number;
  /** 손목·발목의 평균 보이는 정도 (0~1) */
  avgKeyVisibility: number;
  /** 장면 사이 시간 간격으로 잰 fps (영상 재생 기준) */
  measuredFps: number | null;
  /** 분석이 밀려 건너뛴 장면 수 */
  dropped: number;
}

const EMPTY_STATS: Stats = {
  frames: 0,
  predictedFrames: 0,
  legFilledFrames: 0,
  withZero: 0,
  withOne: 0,
  withTwo: 0,
  avgMs: 0,
  avgKeyVisibility: 0,
  measuredFps: null,
  dropped: 0,
};

const presetFocal = (id: CameraPresetId) => CAMERA_PRESETS.find((p) => p.id === id)!.focal35mm;

export default function PoseTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 화면 뒤에서 관절을 찾는 분석 작업자 */
  const analyzerRef = useRef<PoseAnalyzer | null>(null);
  /** 분석 회차 번호. 다시 시작하거나 영상을 바꾸면 늘려서 이전 회차의 반복을 멈춘다 */
  const sessionRef = useRef(0);
  const frameHandleRef = useRef<number | null>(null);
  /** 화면 그리기 반복(모니터 새로고침마다)의 번호 */
  const renderHandleRef = useRef<number | null>(null);
  /** 마지막으로 그린 선수들 (멈춘 상태에서 보기 방식을 바꿀 때 다시 그리기용) */
  const lastPeopleRef = useRef<TrackedPerson[]>([]);
  const viewModeRef = useRef<ViewMode>("3d");
  const view3dRef = useRef<HTMLDivElement>(null);
  const scene3dRef = useRef<Figure3DScene | null>(null);
  /** 영상의 가로÷세로 비율 */
  const aspectRef = useRef(16 / 9);
  /** 촬영 카메라 35mm 환산 초점거리 (원근 계산용) */
  const focal35Ref = useRef<number>(presetFocal("phone"));

  const [status, setStatus] = useState("관절 찾기 도구를 불러오는 중…");
  const [ready, setReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [speed, setSpeed] = useState<number>(0.25);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>("phone");

  // 3D 장면 준비 (화면을 떠나면 그래픽 자원을 정리한다)
  useEffect(() => {
    const container = view3dRef.current;
    if (!container) return;
    const scene = new Figure3DScene(container, PERSON_COLORS);
    scene.setVerticalFov(verticalFovDeg(focalInScreenHeights(presetFocal("phone"), 16 / 9)));
    scene3dRef.current = scene;
    return () => {
      scene.dispose();
      scene3dRef.current = null;
    };
  }, []);

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

  /** 오른쪽 칸에 선수들을 그린다 */
  function draw(people: TrackedPerson[]) {
    if (viewModeRef.current === "3d") {
      scene3dRef.current?.update(people);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const person of people) {
      const color = PERSON_COLORS[person.slot % PERSON_COLORS.length];
      // 예측으로 보여 주는 선수는 흐리게
      const opacity = person.predicted ? PREDICTED_OPACITY : 1;
      if (viewModeRef.current === "figure") drawBodyFigure(ctx, person.image, canvas.width, canvas.height, color, { opacity });
      else {
        ctx.save();
        ctx.globalAlpha = opacity;
        drawSkeleton(ctx, person.image, canvas.width, canvas.height, color);
        ctx.restore();
      }
    }
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
  }

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    stopLoop();
    setAnalyzing(false);
    lastPeopleRef.current = [];
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

  function onChangeView(value: ViewMode) {
    setViewMode(value);
    viewModeRef.current = value;
    draw(lastPeopleRef.current); // 멈춘 상태에서도 바로 바뀌어 보이게
  }

  function onChangeCamera(value: CameraPresetId) {
    setCameraPreset(value);
    focal35Ref.current = presetFocal(value);
    scene3dRef.current?.setVerticalFov(verticalFovDeg(focalInScreenHeights(focal35Ref.current, aspectRef.current)));
  }

  function start() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const analyzer = analyzerRef.current;
    if (!video || !canvas || !analyzer) return;

    // 이전 회차가 돌고 있으면 먼저 멈춘다
    stopLoop();
    const session = sessionRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (video.videoHeight > 0) aspectRef.current = video.videoWidth / video.videoHeight;
    scene3dRef.current?.setVerticalFov(verticalFovDeg(focalInScreenHeights(focal35Ref.current, aspectRef.current)));
    scene3dRef.current?.resetView();

    // 처음부터 다시 분석하므로 추적·거르기·배치도 새로 시작한다
    const tracker = new PoseTracker(aspectRef.current);
    const smoother = new PoseSmoother();
    const placer = new CameraPlacer();
    const timeline = new PoseTimeline();
    const skippedAtStart = analyzer.skipped;

    setStats(EMPTY_STATS);
    setAnalyzing(true);
    setStatus("분석 중… (영상을 재생하며 장면마다 관절을 찾아요)");

    let frames = 0;
    let predictedFrames = 0;
    let legFilledFrames = 0;
    let withZero = 0;
    let withOne = 0;
    let withTwo = 0;
    let totalMs = 0;
    let visibilitySum = 0;
    let visibilityCount = 0;
    let lastMediaTime: number | null = null;
    let intervalSum = 0;
    let intervalCount = 0;
    let lastPresented: number | null = null;
    let missedOnScreen = 0;

    const snapshot = (): Stats => ({
      frames,
      predictedFrames,
      legFilledFrames,
      withZero,
      withOne,
      withTwo,
      avgMs: frames ? totalMs / frames : 0,
      avgKeyVisibility: visibilityCount ? visibilitySum / visibilityCount : 0,
      measuredFps: intervalCount && intervalSum > 0 ? intervalCount / intervalSum : null,
      dropped: missedOnScreen + (analyzer.skipped - skippedAtStart),
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

      // 선수 2명으로 이어 붙이기(겹치면 예측, 잘린 다리 채움) → 떨림 거르기 → 원근으로 3D 배치
      const tracked = tracker.update(detections, result.mediaTime);
      if (tracked.some((p) => p.predicted)) predictedFrames += 1;
      if (tracked.some((p) => p.estimatedJoints.length > 0)) legFilledFrames += 1;
      const smoothed = smoother.apply(tracked, result.mediaTime);
      const focal = focalInScreenHeights(focal35Ref.current, aspectRef.current);
      const placed = placer.apply(smoothed, result.mediaTime, aspectRef.current, focal);

      // 바로 그리지 않고 쌓아 둔다. 그리기는 아래 render 반복이 모니터 새로고침마다 한다
      timeline.push(result.mediaTime, placed, performance.now());
      if (frames % 10 === 0) setStats(snapshot());
    };

    /** 영상 장면이 화면에 나올 때마다 불린다 */
    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (sessionRef.current !== session) return;
      // 멈췄다가 다시 재생해도 이어지도록 항상 다음 장면을 기다린다 (멈춘 동안은 호출되지 않음)
      frameHandleRef.current = video.requestVideoFrameCallback(onFrame);

      // 앞으로 재생된 경우만 간격을 잰다 (뒤로 감은 경우 제외)
      if (lastMediaTime !== null && metadata.mediaTime > lastMediaTime) {
        intervalSum += metadata.mediaTime - lastMediaTime;
        intervalCount += 1;
      }
      lastMediaTime = metadata.mediaTime;
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
      setStatus("분석 중… (영상을 재생하며 장면마다 관절을 찾아요)");
    };
    video.onended = () => {
      if (sessionRef.current !== session) return;
      setStats(snapshot());
      setStatus("분석이 끝났어요. 아래 숫자와 오른쪽 그림을 확인해 주세요.");
    };

    video.currentTime = 0;
    video.playbackRate = speed;
    video.muted = true;

    // 그리기 반복: 분석한 장면은 띄엄띄엄 오지만(0.25배속 30fps 영상이면 1초에 7.5장),
    // 그리기는 모니터가 화면을 바꿀 때마다(초당 약 60번) 앞뒤 장면 사이 자세를 채워 한다
    let lastDrawnTime: number | null = null;
    let lastVersion = -1;
    const render = () => {
      if (sessionRef.current !== session) return;
      renderHandleRef.current = requestAnimationFrame(render);
      const t = timeline.displayTime(performance.now(), video.playbackRate, video.paused);
      if (t === null || (t === lastDrawnTime && timeline.version === lastVersion)) return; // 바뀐 게 없으면 건너뜀
      lastDrawnTime = t;
      lastVersion = timeline.version;
      const people = timeline.sampleAt(t);
      lastPeopleRef.current = people;
      draw(people);
    };

    frameHandleRef.current = video.requestVideoFrameCallback(onFrame);
    renderHandleRef.current = requestAnimationFrame(render);
    void video.play();
  }

  const pct = (n: number) => (stats.frames ? `${Math.round((n / stats.frames) * 100)}%` : "-");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">관절 찾기 시험 (PLAN 작업 4)</h1>
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
                {s}배{s === 1 ? " (원본 속도)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          촬영 카메라
          <select
            value={cameraPreset}
            onChange={(e) => onChangeCamera(e.target.value as CameraPresetId)}
            className="rounded border px-2 py-1"
          >
            {CAMERA_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.focal35mm}mm 환산)
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          보기
          <select value={viewMode} onChange={(e) => onChangeView(e.target.value as ViewMode)} className="rounded border px-2 py-1">
            <option value="3d">3D 사람 모델</option>
            <option value="figure">2D 사람 형체</option>
            <option value="joints">관절 점</option>
          </select>
        </label>
        {viewMode === "3d" && (
          <>
            <button type="button" onClick={() => scene3dRef.current?.resetView()} className="rounded border px-3 py-1 text-sm">
              영상 시점
            </button>
            <button type="button" onClick={() => scene3dRef.current?.sideView()} className="rounded border px-3 py-1 text-sm">
              옆에서 보기
            </button>
          </>
        )}
      </div>
      <p className="text-sm">{status}</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-1 font-semibold">원본 영상</h2>
          {videoUrl ? (
            <video ref={videoRef} src={videoUrl} controls playsInline onError={onVideoError} className="w-full rounded bg-black" />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded bg-gray-100 text-gray-500">영상을 골라 주세요</div>
          )}
        </div>
        <div>
          <h2 className="mb-1 font-semibold">분석 시뮬레이션 (빨강·파랑 = 선수 A·B)</h2>
          {/* 두 칸 모두 늘 만들어 두고 보기 방식에 따라 하나만 보인다 (전환해도 준비된 3D 장면이 사라지지 않게) */}
          <div ref={view3dRef} className={`aspect-video w-full overflow-hidden rounded bg-gray-900 ${viewMode === "3d" ? "" : "hidden"}`} />
          <canvas ref={canvasRef} className={`aspect-video w-full rounded bg-gray-900 ${viewMode === "3d" ? "hidden" : ""}`} />
          {viewMode === "3d" && (
            <p className="mt-1 text-xs text-gray-500">
              마우스 왼쪽 끌기: 돌리기 · 휠: 확대/축소 · 오른쪽 끌기: 옮기기. 멀리 있어 작게 보이는 선수는 그만큼 뒤에 세워요 (원근 반영).
              앞뒤 거리가 실제와 다르면 [촬영 카메라]를 바꿔 보세요.
            </p>
          )}
        </div>
      </div>

      <table className="w-full max-w-xl text-sm">
        <tbody>
          <tr><td className="py-1 text-gray-600">분석한 장면 수</td><td>{stats.frames}</td></tr>
          <tr><td className="py-1 text-gray-600">2명 이상 찾은 장면</td><td>{stats.withTwo} ({pct(stats.withTwo)})</td></tr>
          <tr><td className="py-1 text-gray-600">1명만 찾은 장면</td><td>{stats.withOne} ({pct(stats.withOne)})</td></tr>
          <tr><td className="py-1 text-gray-600">아무도 못 찾은 장면</td><td>{stats.withZero} ({pct(stats.withZero)})</td></tr>
          <tr>
            <td className="py-1 text-gray-600">겹쳐서 못 찾은 선수를 예측으로 이어 그린 장면 (흐리게 표시)</td>
            <td>{stats.predictedFrames} ({pct(stats.predictedFrames)})</td>
          </tr>
          <tr>
            <td className="py-1 text-gray-600">화면 밖·안 보이는 다리를 채워 그린 장면</td>
            <td>{stats.legFilledFrames} ({pct(stats.legFilledFrames)})</td>
          </tr>
          <tr><td className="py-1 text-gray-600">손목·발목 평균 보이는 정도 (0~1)</td><td>{stats.avgKeyVisibility.toFixed(2)}</td></tr>
          <tr><td className="py-1 text-gray-600">장면 하나 처리 시간 (화면 뒤 작업자)</td><td>{stats.avgMs.toFixed(1)} ms</td></tr>
          <tr>
            <td className="py-1 text-gray-600">이 컴퓨터가 1초에 처리할 수 있는 장면 수</td>
            <td>{stats.avgMs > 0 ? `약 ${Math.floor(1000 / stats.avgMs)}장` : "-"}</td>
          </tr>
          <tr><td className="py-1 text-gray-600">분석이 밀려 건너뛴 장면</td><td>{stats.dropped}</td></tr>
          <tr><td className="py-1 text-gray-600">잰 fps (재생 기준, 참고용)</td><td>{stats.measuredFps ? stats.measuredFps.toFixed(1) : "-"}</td></tr>
        </tbody>
      </table>
    </main>
  );
}
