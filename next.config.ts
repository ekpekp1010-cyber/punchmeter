import type { NextConfig } from "next";

// 보안 헤더 (보안 점검 2026-11-24) — Next.js 안내서 "Without Nonces" 방식을 따른다.
// 이 앱은 미리 만들어 두는 정적 페이지라 요청마다 nonce를 만들 수 없어, Next가 페이지에 넣는 작은 스크립트를 위해
// script-src에 'unsafe-inline'을 둔다. 개발 중에는 React가 eval을 써서 'unsafe-eval'도 허용한다 (배포판에는 없음).
// 3D 캐릭터 파일 안의 그림은 blob:/data: 주소로 읽고, PDF용 화면 캡처도 data: 주소라 img·connect에 둘을 허용한다.
// upgrade-insecure-requests는 넣지 않는다: 내 컴퓨터(http://localhost)에서 배포판을 시험할 때 깨지고, Vercel은 늘 https다.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // 다른 사이트가 이 페이지를 틀(iframe) 안에 띄우지 못하게 (클릭재킹 막기, 옛 브라우저용)
  { key: "X-Frame-Options", value: "DENY" },
  // 파일 종류를 브라우저가 멋대로 짐작하지 않게
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 다른 사이트로 넘어갈 때 주소 전체를 넘기지 않게
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 카메라·마이크·위치 등은 쓰지 않으므로 막는다
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // 응답에 "Next.js로 만든 사이트"라고 알리는 X-Powered-By 헤더를 끈다
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
