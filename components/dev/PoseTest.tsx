"use client";

// Design Ref: §5.1 화면 구성 — 원본 영상 옆 칸에 관절을 따로 그린다 (영상 위에 겹쳐 그리지 않음)
// PLAN 작업 4: 관절 찾기 시험 화면. 실제 서비스 화면이 아니라 정확도를 눈으로 확인하는 시험용이다.

import { useEffect, useRef, useState } from "react";
import {
  createVideoPoseLandmarker,
  LANDMARK,
  PoseLandmarker,
} from "@/lib/engine/poseLandmarker";

/** 사람마다 다른 색 (찾은 순서. 같은 사람을 이어서 따라가는 기능은 PLAN 작업 8에서 만든다) */
const PERSON_COLORS = ["#ef4444", "#3b82f6"];

/** 손목·발목: 타격 판정에 가장 중요한 관절이라 보이는 정도를 따로 집계한다 */
const KEY_JOINTS = [LANDMARK.leftWrist, LANDMARK.rightWrist, LANDMARK.leftAnkle, LANDMARK.rightAnkle];

interface Stats {
  frames: number;
  withZero: number;
  withOne: number;
  withTwo: number;
  /** 장면 하나를 처리하는 데 걸린 평균 시간(ms) */
  avgMs: number;
  /** 손목·발목의 평균 보이는 정도 (0~1) */
  avgKeyVisibility: number;
  /** 장면 사이 시간 간격으로 잰 fps (영상 재생 기준) */
  measuredFps: number | null;
}

const EMPTY_STATS: Stats = {
  frames: 0,
  withZero: 0,
  withOne: 0,
  withTwo: 0,
  avgMs: 0,
  avgKeyVisibility: 0,
  measuredFps: null,
};

export default function PoseTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const [status, setStatus] = useState("관절 찾기 도구를 불러오는 중…");
  const [ready, setReady] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  // 관절 찾기 도구 준비
  useEffect(() => {
    let cancelled = false;
    createVideoPoseLandmarker()
      .then(({ landmarker, delegate }) => {
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setReady(true);
        setStatus(`준비 완료 (${delegate === "GPU" ? "그래픽 카드" : "CPU"} 사용). 영상을 골라 주세요.`);
      })
      .catch((error: unknown) => {
        setStatus(`관절 찾기 도구를 불러오지 못했어요: ${String(error)}`);
      });
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  // 고른 영상의 임시 주소는 다른 영상을 고르거나 화면을 떠날 때 지운다
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
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

  function start() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    setStats(EMPTY_STATS);
    setStatus("분석 중… (영상을 천천히 재생하며 장면마다 관절을 찾아요)");

    let frames = 0;
    let withZero = 0;
    let withOne = 0;
    let withTwo = 0;
    let totalMs = 0;
    let visibilitySum = 0;
    let visibilityCount = 0;
    let lastMediaTime: number | null = null;
    let intervalSum = 0;
    let intervalCount = 0;
    let lastTimestampMs = -1;

    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      // detectForVideo는 시간이 계속 늘어나야 하므로 같은 시각이 오면 건너뛴다
      const timestampMs = metadata.mediaTime * 1000;
      if (timestampMs > lastTimestampMs) {
        lastTimestampMs = timestampMs;
        const t0 = performance.now();
        const result = landmarker.detectForVideo(video, timestampMs);
        totalMs += performance.now() - t0;
        frames += 1;

        const people = result.landmarks;
        if (people.length === 0) withZero += 1;
        else if (people.length === 1) withOne += 1;
        else withTwo += 1;

        for (const person of people) {
          for (const index of KEY_JOINTS) {
            visibilitySum += person[index]?.visibility ?? 0;
            visibilityCount += 1;
          }
        }

        if (lastMediaTime !== null) {
          intervalSum += metadata.mediaTime - lastMediaTime;
          intervalCount += 1;
        }
        lastMediaTime = metadata.mediaTime;

        // 옆 칸에 관절과 연결선을 그린다
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        people.forEach((person, i) => {
          const color = PERSON_COLORS[i % PERSON_COLORS.length];
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(2, canvas.width / 300);
          for (const { start: a, end: b } of PoseLandmarker.POSE_CONNECTIONS) {
            const p = person[a];
            const q = person[b];
            if (!p || !q) continue;
            ctx.beginPath();
            ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
            ctx.lineTo(q.x * canvas.width, q.y * canvas.height);
            ctx.stroke();
          }
          ctx.fillStyle = color;
          for (const point of person) {
            // 잘 안 보이는 관절은 흐리게
            ctx.globalAlpha = 0.3 + 0.7 * (point.visibility ?? 0);
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 200), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        });

        if (frames % 10 === 0) {
          setStats({
            frames,
            withZero,
            withOne,
            withTwo,
            avgMs: totalMs / frames,
            avgKeyVisibility: visibilityCount ? visibilitySum / visibilityCount : 0,
            measuredFps: intervalCount ? intervalCount / intervalSum : null,
          });
        }
      }
      if (!video.ended && !video.paused) video.requestVideoFrameCallback(onFrame);
    };

    video.onended = () => {
      setStats({
        frames,
        withZero,
        withOne,
        withTwo,
        avgMs: frames ? totalMs / frames : 0,
        avgKeyVisibility: visibilityCount ? visibilitySum / visibilityCount : 0,
        measuredFps: intervalCount ? intervalCount / intervalSum : null,
      });
      setStatus("분석이 끝났어요. 아래 숫자와 오른쪽 그림을 확인해 주세요.");
    };

    video.currentTime = 0;
    // 장면을 빠뜨리지 않도록 0.25배속으로 재생하며 분석한다
    video.playbackRate = 0.25;
    video.muted = true;
    video.requestVideoFrameCallback(onFrame);
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
          분석 시작
        </button>
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
          <h2 className="mb-1 font-semibold">찾은 관절 (빨강·파랑 = 찾은 사람 순서)</h2>
          <canvas ref={canvasRef} className="aspect-video w-full rounded bg-gray-900" />
        </div>
      </div>

      <table className="w-full max-w-xl text-sm">
        <tbody>
          <tr><td className="py-1 text-gray-600">분석한 장면 수</td><td>{stats.frames}</td></tr>
          <tr><td className="py-1 text-gray-600">2명 찾은 장면</td><td>{stats.withTwo} ({pct(stats.withTwo)})</td></tr>
          <tr><td className="py-1 text-gray-600">1명만 찾은 장면</td><td>{stats.withOne} ({pct(stats.withOne)})</td></tr>
          <tr><td className="py-1 text-gray-600">아무도 못 찾은 장면</td><td>{stats.withZero} ({pct(stats.withZero)})</td></tr>
          <tr><td className="py-1 text-gray-600">손목·발목 평균 보이는 정도 (0~1)</td><td>{stats.avgKeyVisibility.toFixed(2)}</td></tr>
          <tr><td className="py-1 text-gray-600">장면 하나 처리 시간</td><td>{stats.avgMs.toFixed(1)} ms</td></tr>
          <tr><td className="py-1 text-gray-600">잰 fps (재생 기준, 참고용)</td><td>{stats.measuredFps ? stats.measuredFps.toFixed(1) : "-"}</td></tr>
        </tbody>
      </table>
    </main>
  );
}
