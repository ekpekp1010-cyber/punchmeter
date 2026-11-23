// PLAN 작업 3: 3D 캐릭터 시험 화면 (/model-test). 실제 실험실 화면은 PLAN 작업 8 이후에 만든다.
import type { Metadata } from "next";
import ModelTest from "@/components/scene/ModelTest";

export const metadata: Metadata = {
  title: "3D 캐릭터 시험 | 펀치미터",
};

export default function ModelTestPage() {
  return <ModelTest />;
}
