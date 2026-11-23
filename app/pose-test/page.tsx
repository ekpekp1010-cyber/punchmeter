// PLAN 작업 4: 관절 찾기 시험 화면 (/pose-test). 실제 서비스 화면은 PLAN 작업 16 이후에 만든다.
import type { Metadata } from "next";
import PoseTest from "@/components/dev/PoseTest";

export const metadata: Metadata = {
  title: "관절 찾기 시험 | 펀치미터",
};

export default function PoseTestPage() {
  return <PoseTest />;
}
