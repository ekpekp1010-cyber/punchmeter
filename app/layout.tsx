import type { Metadata } from "next";
import { Archivo, Onest } from "next/font/google";
import "./globals.css";

// 글꼴: Forge Gate 디자인과 같은 무료 Google Fonts. 빌드 때 내려받아 이 사이트에서 직접 제공한다
// (방문자 브라우저가 Google에 요청하지 않는다). 한글은 운영체제 글꼴로 이어진다 (globals.css)
/** 제목·숫자용 넓은 글꼴 (폭 축 포함) */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

/** 본문 글꼴 */
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "펀치미터 · 타격 실험실",
  description: "선수 정보와 기술·부위·속도를 정하면 3D로 타격을 재생하고, 연구 근거와 함께 힘·에너지·의학적 판단을 보여 줍니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${archivo.variable} ${onest.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
