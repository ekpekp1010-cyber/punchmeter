// Design Ref: §4.3 기술 선택 — MediaPipe Pose Landmarker로 브라우저 안에서 관절 33곳을 찾는다
// PLAN 작업 4: 관절 찾기 시험. 영상은 서버로 보내지 않고 이 브라우저 안에서만 처리한다.

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

/** WASM 파일 위치 (scripts/copy-mediapipe.mjs가 public 폴더에 복사) */
export const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";

/**
 * 관절 찾기 모델 파일 (Google 공식 저장소, 약 9.4MB).
 * 브라우저가 이 주소에서 모델만 내려받는다. 영상·입력값은 어디에도 보내지 않는다.
 */
export const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

/** 자주 쓰는 관절 번호 (MediaPipe 33개 관절 중. left/right는 선수 본인 기준) */
export const LANDMARK = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

/**
 * 영상용 관절 찾기 도구를 만든다 (최대 2명).
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
      numPoses: 2,
    });
  try {
    return { landmarker: await make("GPU"), delegate: "GPU" };
  } catch {
    return { landmarker: await make("CPU"), delegate: "CPU" };
  }
}

export { PoseLandmarker };
