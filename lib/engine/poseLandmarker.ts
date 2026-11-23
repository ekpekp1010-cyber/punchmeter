// Design Ref: §4.3 기술 선택 — MediaPipe Pose Landmarker로 브라우저 안에서 관절 33곳을 찾는다
// PLAN 작업 4: 관절 찾기 시험. 영상은 서버로 보내지 않고 이 브라우저 안에서만 처리한다.

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export { LANDMARK } from "./landmarks";

/** WASM 파일 위치 (scripts/copy-mediapipe.mjs가 public 폴더에 복사) */
export const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";

/**
 * 관절 찾기 모델 파일 (Google 공식 저장소, 약 9.4MB).
 * 브라우저가 이 주소에서 모델만 내려받는다. 영상·입력값은 어디에도 보내지 않는다.
 */
export const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

/**
 * 한 장면에서 찾을 최대 인원.
 * 선수 2명 + 심판 1명까지 찾아 두고, 선수 추적기(poseTracker)가 그중 선수 2명만 골라 따라간다.
 * (2명으로 제한하면 심판이 자리를 차지해 선수 한 명이 빠지는 일이 생긴다)
 */
export const MAX_POSES = 3;

/**
 * 사람으로 인정하는 최소 확신도 (기본값 0.5 → 0.4).
 * 선수끼리 겹쳐 몸이 일부 가려져도 찾을 수 있게 조금 낮춘다. 너무 낮추면 엉뚱한 물체를 사람으로 잡는다.
 */
export const MIN_POSE_CONFIDENCE = 0.4;

/**
 * 영상용 관절 찾기 도구를 만든다.
 * 그래픽 카드(GPU)로 먼저 시도하고, 안 되면 CPU로 다시 만든다.
 */
export async function createVideoPoseLandmarker(): Promise<{
  landmarker: PoseLandmarker;
  delegate: "GPU" | "CPU";
}> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
  const make = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
      runningMode: "VIDEO",
      numPoses: MAX_POSES,
      minPoseDetectionConfidence: MIN_POSE_CONFIDENCE,
      minPosePresenceConfidence: MIN_POSE_CONFIDENCE,
      minTrackingConfidence: MIN_POSE_CONFIDENCE,
    });
  try {
    return { landmarker: await make("GPU"), delegate: "GPU" };
  } catch {
    return { landmarker: await make("CPU"), delegate: "CPU" };
  }
}

export { PoseLandmarker };
