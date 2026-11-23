// Design Ref: §4.3 Web Worker — 화면 쪽에서 분석 작업자에게 장면을 보내고 결과를 받는 창구.
// 작업자는 한 번에 한 장면만 분석한다. 분석 중에 새 장면이 오면 "가장 최근 장면 하나"만 기다리게 하고 그 전 것은 버린다
// (밀린 장면을 쌓아 두면 그림이 영상보다 점점 늦어지기 때문).

import type { PoseWorkerRequest, PoseWorkerResponse } from "./poseWorkerProtocol";

export type DetectResult = Extract<PoseWorkerResponse, { type: "result" }>;

interface Pending {
  bitmap: ImageBitmap;
  mediaTime: number;
  onResult: (result: DetectResult) => void;
}

export class PoseAnalyzer {
  private readonly worker: Worker;
  private busy = false;
  private pending: Pending | null = null;
  private nextId = 0;
  private callbacks = new Map<number, (result: DetectResult) => void>();
  /** 분석이 밀려 건너뛴 장면 수 */
  skipped = 0;

  constructor() {
    this.worker = new Worker(new URL("./pose.worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event: MessageEvent<PoseWorkerResponse>) => {
      const message = event.data;
      if (message.type !== "result") return;
      const callback = this.callbacks.get(message.id);
      this.callbacks.delete(message.id);
      this.busy = false;
      callback?.(message);
      // 기다리던 최근 장면이 있으면 이어서 보낸다
      const next = this.pending;
      this.pending = null;
      if (next) this.send(next);
    });
  }

  /** 작업자 안에서 관절 찾기 도구를 준비한다 */
  init(): Promise<"GPU" | "CPU"> {
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent<PoseWorkerResponse>) => {
        const message = event.data;
        if (message.type === "ready") resolve(message.delegate);
        else if (message.type === "error") reject(new Error(message.message));
        else return;
        this.worker.removeEventListener("message", onMessage);
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", (event) => reject(new Error(event.message || "분석 작업자를 시작하지 못했어요")), {
        once: true,
      });
      this.post({ type: "init" });
    });
  }

  /** 장면 하나를 분석해 달라고 보낸다 (분석 중이면 최근 장면 하나만 기다리게 한다) */
  submit(bitmap: ImageBitmap, mediaTime: number, onResult: (result: DetectResult) => void) {
    const job = { bitmap, mediaTime, onResult };
    if (!this.busy) {
      this.send(job);
      return;
    }
    if (this.pending) {
      this.pending.bitmap.close();
      this.skipped += 1;
    }
    this.pending = job;
  }

  /** 기다리던 장면을 버린다 (다시 시작·영상 바꿈) */
  clearPending() {
    this.pending?.bitmap.close();
    this.pending = null;
  }

  terminate() {
    this.clearPending();
    this.worker.terminate();
  }

  private send(job: Pending) {
    const id = this.nextId++;
    this.busy = true;
    this.callbacks.set(id, job.onResult);
    this.post({ type: "detect", id, bitmap: job.bitmap, mediaTime: job.mediaTime }, [job.bitmap]);
  }

  private post(message: PoseWorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(message, transfer);
  }
}
