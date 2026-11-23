// Design Ref: §8.2 계산 테스트 — 물리 계산 함수가 설계서의 예시대로 동작하는지 확인한다
// 실행: npm test

import { describe, expect, it } from "vitest";
import {
  CONTACT_TIME_S,
  checkAgainstMethodB,
  colorStep,
  directionAngleDeg,
  effectiveMassKg,
  gloveForceFactor,
  gloveMassKg,
  headAccelToForceN,
  intensityIndex,
  isPlausibleSpeed,
  isValidWeighIn,
  kineticEnergy,
  loadRatioPct,
  momentToForceN,
  momentum,
  partThreshold,
  peakForceN,
  regainKg,
  segmentLengthM,
  segmentMassKg,
  velocity,
} from "./index";
import { JOINT_LOCK_REFERENCE, PART_THRESHOLD_PLAN } from "../reference";

describe("몸무게", () => {
  it("계체량 70kg이면 리게인 75.25kg", () => {
    expect(regainKg(70)).toBeCloseTo(75.25, 5);
  });

  it("계체량 39kg과 151kg은 받지 않고, 40kg과 150kg은 받는다", () => {
    expect(isValidWeighIn(39)).toBe(false);
    expect(isValidWeighIn(151)).toBe(false);
    expect(isValidWeighIn(40)).toBe(true);
    expect(isValidWeighIn(150)).toBe(true);
  });
});

describe("분절 (de Leva 1996)", () => {
  it("73kg 남성의 아래팔 무게는 체중의 1.62%", () => {
    expect(segmentMassKg("forearm", 73, "male")).toBeCloseTo(1.1826, 4);
  });

  it("평균 키(174.1cm) 남성의 아래팔 길이는 표의 평균 길이 26.89cm", () => {
    expect(segmentLengthM("forearm", 174.1, "male")).toBeCloseTo(0.2689, 4);
  });
});

describe("속도와 각도", () => {
  it("0.01초 동안 화면 0.1단위(=0.1m) 움직이면 10 m/s", () => {
    const v = velocity({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 0.01, 1);
    expect(v.x).toBeCloseTo(10, 6);
  });

  it("오른쪽은 0°, 화면 위쪽(y 감소)은 90°", () => {
    expect(directionAngleDeg({ x: 1, y: 0 })).toBeCloseTo(0, 6);
    expect(directionAngleDeg({ x: 0, y: -1 })).toBeCloseTo(90, 6);
  });

  it("속도 25 m/s와 0.3 m/s는 이상값, 10 m/s는 정상", () => {
    expect(isPlausibleSpeed(25)).toBe(false);
    expect(isPlausibleSpeed(0.3)).toBe(false);
    expect(isPlausibleSpeed(10)).toBe(true);
  });
});

describe("유효 질량 (영상 분절 운동량 방식)", () => {
  it("손 0.5kg·10m/s, 아래팔 1.2kg·8m/s, 위팔 2kg·5m/s → 2.46kg", () => {
    const m = effectiveMassKg(
      [
        { massKg: 0.5, velocity: { x: 10, y: 0 } },
        { massKg: 1.2, velocity: { x: 8, y: 0 } },
        { massKg: 2, velocity: { x: 5, y: 0 } },
      ],
      { x: 10, y: 0 },
    );
    expect(m).toBeCloseTo(2.46, 6);
  });

  it("타격 방향과 반대로 움직이는 분절은 유효 질량을 줄인다", () => {
    const m = effectiveMassKg(
      [
        { massKg: 1, velocity: { x: 10, y: 0 } },
        { massKg: 10, velocity: { x: -1, y: 0 } },
      ],
      { x: 10, y: 0 },
    );
    expect(m).toBeCloseTo(0, 6);
  });

  it("주먹이 멈춰 있으면 계산하지 않는다 (null)", () => {
    expect(effectiveMassKg([{ massKg: 1, velocity: { x: 0, y: 0 } }], { x: 0, y: 0 })).toBeNull();
  });

  it("글러브 10oz는 유효 질량에 283.5g을 더한다", () => {
    expect(gloveMassKg(10)).toBeCloseTo(0.2835, 6);
  });

  it("방법 B 검산: 돌려차기 체중의 19%는 범위 안, 300%는 범위 밖", () => {
    expect(checkAgainstMethodB(13.3, 70, "roundhouseKick")?.outOfRange).toBe(false);
    expect(checkAgainstMethodB(210, 70, "roundhouseKick")?.outOfRange).toBe(true);
  });
});

describe("운동량·에너지·충격력", () => {
  it("유효 질량 3kg, 속도 9m/s → 운동량 27, 운동에너지 121.5J", () => {
    expect(momentum(3, 9)).toBe(27);
    expect(kineticEnergy(3, 9)).toBeCloseTo(121.5, 6);
  });

  it("충격 시간 환산값은 walilko2005 평균(2.9kg·9.14m/s → 3427N)으로 정해진다", () => {
    expect(CONTACT_TIME_S).toBeCloseTo((2.9 * 9.14) / 3427, 9);
    expect(peakForceN(2.9, 9.14)).toBeCloseTo(3427, 6);
  });
});

describe("글러브 보정 (추천안)", () => {
  it("같은 펀치라면 16oz의 충격력이 10oz보다 측정 비율(1900/2090)만큼 낮다", () => {
    const g10 = gloveForceFactor(10, "punch");
    const g16 = gloveForceFactor(16, "punch");
    expect(g10.factor).toBe(1);
    expect(g16.factor).toBeCloseTo(1900 / 2090, 6);
    expect(g16.basis).toBe("measured");
  });

  it("8oz는 10oz 값을 빌리고(borrowed), 맨손·4oz는 흡수 없음(insufficient)", () => {
    expect(gloveForceFactor(8, "punch")).toEqual({ factor: 1, basis: "borrowed" });
    expect(gloveForceFactor(0, "punch")).toEqual({ factor: 1, basis: "insufficient" });
    expect(gloveForceFactor(4, "punch")).toEqual({ factor: 1, basis: "insufficient" });
  });

  it("킥은 글러브와 상관없이 보정하지 않는다", () => {
    expect(gloveForceFactor(16, "kick")).toEqual({ factor: 1, basis: "notApplicable" });
  });
});

describe("타격 강도 지수", () => {
  it("펀치 최고 기록(5358N)과 같으면 100, 넘으면 100에서 자른다", () => {
    expect(intensityIndex(5358, "punch")).toBeCloseTo(100, 6);
    expect(intensityIndex(8000, "punch")).toBe(100);
  });

  it("킥은 킥 최고 기록(9015N) 기준", () => {
    expect(intensityIndex(4507.5, "kick")).toBeCloseTo(50, 6);
  });

  it("팔꿈치는 팔꿈치 최고 기록(10800N) 기준", () => {
    expect(intensityIndex(5400, "elbow")).toBeCloseTo(50, 6);
  });

  it("무릎은 공개 최고 기록이 없어 '자료 없음'(null)", () => {
    expect(intensityIndex(3000, "knee")).toBeNull();
  });
});

describe("관절기 참고값", () => {
  it("관절기 6가지 모두 정상 범위 자료가 있다", () => {
    const locks = Object.values(JOINT_LOCK_REFERENCE);
    expect(locks).toHaveLength(6);
    for (const lock of locks) expect(lock.normalRange).not.toBeNull();
  });

  it("부상 각도 자료가 없는 암바·기무라·아메리카나·앵클록은 숫자를 지어내지 않고 비워 둔다", () => {
    for (const id of ["armbar", "kimura", "americana", "ankleLock"] as const) {
      expect(JOINT_LOCK_REFERENCE[id].injuryAngle).toBeNull();
    }
  });

  it("힐훅의 부상 각도(58°)는 정상 범위(17.5~20°)보다 크다", () => {
    const heel = JOINT_LOCK_REFERENCE.heelHook;
    expect(heel.injuryAngle?.value).toBe(58);
    expect(heel.normalRange?.male.value).toEqual([17.5, 20]);
  });
});

describe("한계 힘 환산", () => {
  it("아래팔 94 N·m, 길이 0.269m, 가운데를 맞으면 약 1,398N", () => {
    expect(momentToForceN(94, 0.269)).toBeCloseTo((4 * 94) / 0.269, 6);
    expect(momentToForceN(94, 0.269)).toBeCloseTo(1397.8, 1);
  });

  it("관절 가까이를 맞으면 같은 모멘트라도 한계 힘이 커진다", () => {
    expect(momentToForceN(94, 0.269, 0.05)).toBeGreaterThan(momentToForceN(94, 0.269));
  });

  it("뇌진탕 50% 위험 가속도 778 m/s² → 약 4,690N", () => {
    // 6.025kg × 778 m/s² ≈ 4,687.5N
    expect(headAccelToForceN(778)).toBeCloseTo(4690, -1);
  });

  it("허벅지는 연구값이 이미 힘(4780N)이라 추정 표시가 없다", () => {
    const t = partThreshold("thighLeft", "male", 175);
    expect(t.forceN).toBe(4780);
    expect(t.estimated).toBe(false);
  });

  it("아래팔·명치·턱은 환산·빌린 값이라 추정 표시", () => {
    expect(partThreshold("forearmRight", "male", 174.1).estimated).toBe(true);
    expect(partThreshold("solarPlexus", "female", 165).estimated).toBe(true);
    expect(partThreshold("jaw", "male", 180).estimated).toBe(true);
  });

  it("부위 22곳 모두 한계 힘 기준이 있다 (빠진 부위 없음)", () => {
    expect(Object.keys(PART_THRESHOLD_PLAN)).toHaveLength(22);
  });

  it("간은 비스듬한 충격의 간 손상 연구값(1.9~2.1kN 중 1900N)이 이미 힘이라 추정 표시가 없다", () => {
    const t = partThreshold("liver", "male", 175);
    expect(t.forceN).toBe(1900);
    expect(t.estimated).toBe(false);
  });

  it("명치는 정면 가슴 자료로 추정하며, 여성(4170N)이 남성(4910N)보다 낮다", () => {
    const male = partThreshold("solarPlexus", "male", 175);
    const female = partThreshold("solarPlexus", "female", 165);
    expect(male.forceN).toBe(4910);
    expect(female.forceN).toBe(4170);
    expect(male.estimated).toBe(true);
  });

  it("종아리와 정강이는 같은 정강이뼈 기준이라 한계 힘이 같다", () => {
    expect(partThreshold("calfLeft", "male", 175).forceN).toBe(partThreshold("shinLeft", "male", 175).forceN);
  });

  it("여성 위팔(128 N·m)은 남성(257 N·m)보다 한계 힘이 낮다", () => {
    const female = partThreshold("upperArmLeft", "female", 170).forceN;
    const male = partThreshold("upperArmLeft", "male", 170).forceN;
    expect(female).toBeLessThan(male);
  });
});

describe("누적 충격 색", () => {
  it("한계 힘 1,000N 부위에 300N 두 번(600N) → 60% → 3단계", () => {
    expect(colorStep(loadRatioPct(600, 1000))).toBe(3);
  });

  it("같은 500N이라도 한계 1,000N 부위는 3단계, 2,000N 부위는 2단계", () => {
    expect(colorStep(loadRatioPct(500, 1000))).toBe(3);
    expect(colorStep(loadRatioPct(500, 2000))).toBe(2);
  });

  it("단계 경계: 0%→0, 10%→1, 30%→2, 80%→4, 120%→5, 자료 없음→null", () => {
    expect(colorStep(0)).toBe(0);
    expect(colorStep(10)).toBe(1);
    expect(colorStep(30)).toBe(2);
    expect(colorStep(80)).toBe(4);
    expect(colorStep(120)).toBe(5);
    expect(colorStep(null)).toBeNull();
  });
});
