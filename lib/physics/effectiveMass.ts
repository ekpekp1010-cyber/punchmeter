// Design Ref: §2.2 처리 ② — 유효 질량: 연구값이 있으면 연구값, 없으면 분절 비율표(de Leva)로 어림
// PLAN 작업 6 (계산 연결). 영상 시절의 "분절 속도로 구하는 방식"은 쓰지 않는다 (3D 실험실은 속도만 정하므로).
//
// 분절 어림 규칙 ("추정"으로 표시):
//   값(= 범위 아래 끝) = 몸통에 가장 가까운 분절(목록의 마지막)을 뺀 끝쪽 분절 무게의 합
//   범위 위 끝        = 그 기술에서 움직이는 분절(techniques.ts의 segments) 무게 전체의 합
// 예) 펀치: 손 + 아래팔 = 값, 손 + 아래팔 + 위팔 = 위 끝 / 킥: 발 + 정강이 = 값, + 허벅지 = 위 끝
// 전체 합을 값으로 쓰면 "허벅지까지 통째로 발 속도로 움직인다"고 보는 셈이라 킥 충격력이 공개 최고 기록의
// 몇 배로 커졌다 (70kg 미들킥 약 25,800 N). 끝쪽 분절 합은 공개 측정값과 비슷하게 나온다
// (70kg 기준 잽 약 1,340 N·훅 약 2,665 N·미들킥 약 7,420 N, PLAN 작업 22에서 다시 검증).

import { OZ_TO_KG, type Segment } from "../reference";
import type { GloveOz, Sex } from "../types";
import { segmentMassKg } from "./body";

/** 글러브 한 짝의 무게(kg). 펀치의 유효 질량에 더한다 */
export function gloveMassKg(gloveOz: GloveOz): number {
  return gloveOz * OZ_TO_KG;
}

export interface SegmentMassEstimate {
  /** 가장 몸통 쪽 분절을 뺀 끝쪽 분절 무게의 합(kg). 분절이 하나뿐이면 그 분절 무게 */
  valueKg: number;
  /** 움직이는 분절 전체 무게의 합(kg) — 추정 범위 위 끝 */
  highKg: number;
}

/**
 * 분절 비율표로 어림한 유효 질량.
 * segments는 끝(손·발)에서 몸통 쪽 순서로 적는다 (예: ["hand", "forearm", "upperArm"]).
 */
export function segmentEffectiveMass(segments: Segment[], bodyMassKg: number, sex: Sex): SegmentMassEstimate {
  if (segments.length === 0) throw new Error("분절이 하나 이상 있어야 합니다");
  const masses = segments.map((s) => segmentMassKg(s, bodyMassKg, sex));
  const highKg = masses.reduce((a, b) => a + b, 0);
  const valueKg = masses.length > 1 ? highKg - masses[masses.length - 1] : highKg;
  return { valueKg, highKg };
}
