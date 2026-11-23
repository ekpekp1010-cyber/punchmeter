// MediaPipe 관절 찾기 도구의 WASM 파일을 public 폴더로 복사한다.
// 브라우저가 이 파일을 /mediapipe/wasm/ 주소에서 내려받아 관절 찾기를 실행한다.
// node_modules에서 복사해 오는 파일이라 Git에는 올리지 않는다 (.gitignore의 /public/mediapipe/).
// npm run dev / npm run build 전에 자동으로 실행된다 (package.json의 predev·prebuild).

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "mediapipe", "wasm");

if (!existsSync(from)) {
  console.error("MediaPipe WASM 폴더가 없습니다. npm install을 먼저 실행하세요:", from);
  process.exit(1);
}

mkdirSync(to, { recursive: true });
for (const name of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  cpSync(join(from, name), join(to, name));
}
console.log("MediaPipe WASM 복사 완료 →", to);
