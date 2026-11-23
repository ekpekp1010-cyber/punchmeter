import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // node_modules에서 복사해 온 MediaPipe 파일 (우리가 쓴 코드가 아니라 검사 대상에서 뺀다)
    "public/mediapipe/**",
    // 지울 파일을 임시로 옮겨 두는 폴더 (검사 대상 아님)
    "trash-can/**",
  ]),
]);

export default eslintConfig;
