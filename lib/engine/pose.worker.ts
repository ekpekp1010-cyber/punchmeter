// Design Ref: §4.3 Web Worker — 무거운 관절 찾기를 화면 뒤 별도 작업 공간에서 돌려, 화면 그리기가 멈칫하지 않게 한다.
// PLAN 작업 7(분석 실행기)의 바탕. 영상 장면은 이 브라우저 안에서만 오가고 서버로 보내지 않는다.

import { createVideoPoseLandmarker, MEDIAPIPE_WASM_PATH, type PoseLandmarker, type VisionFileset } from "./poseLandmarker";
import type { PoseWorkerRequest, PoseWorkerResponse } from "./poseWorkerProtocol";
import type { PoseLandmark } from "../types";

let landmarker: PoseLandmarker | null = null;
/** detectForVideo에 보낸 마지막 시각. 계속 늘어나야 해서 처음부터 다시 봐도 줄이지 않는다 */
let lastTimestampMs = -1;

const post = (message: PoseWorkerResponse) => (self as unknown as Worker).postMessage(message);

/**
 * MediaPipe의 WASM 불러오기 파일을 직접 실행해 둔다.
 * 이 작업자는 "모듈 방식"이라 MediaPipe가 쓰는 importScripts가 막혀 있어서, 내용을 받아 실행한 뒤 ModuleFactory를 전역에 걸어 둔다.
 */
async function loadWasmLoader(): Promise<VisionFileset> {
  const response = await fetch(`${MEDIAPIPE_WASM_PATH}/vision_wasm_internal.js`);
  if (!response.ok) throw new Error(`WASM 불러오기 파일을 받지 못했어요 (${response.status})`);
  const code = await response.text();
  new Function(`${code}\nself.ModuleFactory = ModuleFactory;`)();
  // wasmLoaderPath를 비워 두면 MediaPipe가 위에서 걸어 둔 ModuleFactory를 그대로 쓴다
  return { wasmLoaderPath: "", wasmBinaryPath: `${MEDIAPIPE_WASM_PATH}/vision_wasm_internal.wasm` };
}

/** 결과를 순수한 숫자 묶음으로 옮긴다 (작업자 → 화면으로 보낼 수 있게) */
const plain = (people: { x: number; y: number; z: number; visibility?: number }[][]): PoseLandmark[][] =>
  people.map((person) => person.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 })));

self.onmessage = async (event: MessageEvent<PoseWorkerRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      const fileset = await loadWasmLoader();
      const created = await createVideoPoseLandmarker(fileset);
      landmarker = created.landmarker;
      post({ type: "ready", delegate: created.delegate });
    } catch (error) {
      post({ type: "error", message: String(error) });
    }
    return;
  }

  const { id, bitmap, mediaTime } = message;
  const t0 = performance.now();
  try {
    if (!landmarker) throw new Error("관절 찾기 도구가 아직 준비되지 않았어요");
    const timestampMs = Math.max(mediaTime * 1000, lastTimestampMs + 1);
    lastTimestampMs = timestampMs;
    const result = landmarker.detectForVideo(bitmap, timestampMs);
    post({
      type: "result",
      id,
      mediaTime,
      image: plain(result.landmarks),
      world: plain(result.worldLandmarks),
      ms: performance.now() - t0,
    });
  } catch (error) {
    post({ type: "result", id, mediaTime, image: [], world: [], ms: performance.now() - t0, error: String(error) });
  } finally {
    bitmap.close();
  }
};
