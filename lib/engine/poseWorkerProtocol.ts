// 화면 ↔ 분석 작업자(Web Worker) 사이에 주고받는 메시지 모양
import type { PoseLandmark } from "../types";

export type PoseWorkerRequest =
  | { type: "init" }
  | {
      type: "detect";
      /** 요청 번호 (결과와 짝짓기용) */
      id: number;
      /** 분석할 장면 그림 (작업자에게 넘기면 화면 쪽에서는 더 못 쓴다) */
      bitmap: ImageBitmap;
      /** 영상 속 시각 (초) */
      mediaTime: number;
    };

export type PoseWorkerResponse =
  | { type: "ready"; delegate: "GPU" | "CPU" }
  | { type: "error"; message: string }
  | {
      type: "result";
      id: number;
      mediaTime: number;
      /** 찾은 사람마다 화면 기준 위치 */
      image: PoseLandmark[][];
      /** 찾은 사람마다 실제 크기 3D 위치 (m) */
      world: PoseLandmark[][];
      /** 이 장면 분석에 걸린 시간 (ms) */
      ms: number;
      error?: string;
    };
