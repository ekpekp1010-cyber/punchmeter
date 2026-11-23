// Design Ref: §3 데이터 모델 — 서버·데이터베이스 없이 브라우저 메모리에만 두는 데이터의 모양
// PLAN 작업 2: 3D 타격 실험실에 맞춰 선수, 노릴 부위 22곳, 기술, 근거가 붙은 숫자,
// 연타 한 칸, 계산 결과, 부위별 누적, 관절기 실험의 모양을 정한다.
// 이 파일에는 계산 코드가 없고 "어떤 칸에 어떤 값이 들어가는지"만 정한다.

// ─────────────────────────────────────────────
// 공통으로 쓰는 작은 타입
// ─────────────────────────────────────────────

/** 선수 구분 */
export type FighterId = "A" | "B";

/** 글러브 무게(oz). 0은 맨손, 4는 MMA 글러브 */
export type GloveOz = 0 | 4 | 8 | 10 | 12 | 14 | 16;

/** 성별. 분절 체중 비율표(de Leva 1996)가 남녀로 나뉘어 있고, 3D 체형도 남녀로 고른다 */
export type Sex = "male" | "female";

/** 신체 구역 (부위를 묶어 보여 줄 때 쓴다) */
export type BodyRegion = "head" | "torso" | "arm" | "leg";

/**
 * 노릴(맞을) 신체 부위 22곳. 누적 충격·색과 의학적 판단의 단위다.
 * left/right는 맞는 선수 본인 기준.
 */
export type BodyPart =
  // 머리 7곳
  | "jaw" // 턱
  | "nose" // 코
  | "cheekLeft" // 왼 광대
  | "cheekRight" // 오른 광대
  | "forehead" // 이마
  | "templeLeft" // 왼 관자놀이
  | "templeRight" // 오른 관자놀이
  // 몸통 5곳
  | "solarPlexus" // 명치
  | "ribsLeft" // 왼 옆구리(갈비)
  | "ribsRight" // 오른 옆구리(갈비)
  | "liver" // 간 (오른쪽 아래 갈비 부근)
  | "abdomen" // 복부
  // 팔 4곳
  | "upperArmLeft" // 왼 위팔
  | "upperArmRight" // 오른 위팔
  | "forearmLeft" // 왼 아래팔
  | "forearmRight" // 오른 아래팔
  // 다리 6곳
  | "thighLeft" // 왼 허벅지
  | "thighRight" // 오른 허벅지
  | "calfLeft" // 왼 종아리(뒤)
  | "calfRight" // 오른 종아리(뒤)
  | "shinLeft" // 왼 정강이(앞)
  | "shinRight"; // 오른 정강이(앞)

/** 타격 기술 12가지 (펀치 4, 킥 6, 팔꿈치, 무릎) */
export type TechniqueId =
  | "jab" // 잽
  | "cross" // 크로스(스트레이트)
  | "hook" // 훅
  | "uppercut" // 어퍼컷
  | "lowKick" // 로우킥
  | "calfKick" // 카프킥
  | "middleKick" // 미들킥
  | "highKick" // 하이킥
  | "frontKick" // 프런트킥
  | "sideKick" // 사이드킥
  | "elbow" // 팔꿈치
  | "knee"; // 무릎

/** 기술 종류. 글러브 보정과 최고 충격력 기록을 고를 때 쓴다 */
export type TechniqueKind = "punch" | "kick" | "elbow" | "knee";

/** 앞손·앞발 / 뒷손·뒷발 */
export type StrikeSide = "lead" | "rear";

/** 수비: 맞음 / 팔로 막음 (킥을 막으면 아래팔, 낮은 킥은 정강이로 받는다) */
export type Defense = "none" | "armBlock";

// ─────────────────────────────────────────────
// 선수 입력값
// ─────────────────────────────────────────────

/**
 * 선수 정보. 리게인 몸무게는 저장하지 않고 weighInKg × 1.075로 계산한다.
 */
export interface Fighter {
  id: FighterId;
  /** 성별. 분절 비율표의 남녀 값과 3D 체형을 정한다 */
  sex: Sex;
  /** 계체량 몸무게(kg). 40~150만 받는다 */
  weighInKg: number;
  /** 키(cm). 140~220만 받는다. 3D 크기와 뼈 길이 환산에 쓴다 */
  heightCm: number;
  /** 리치(cm), 양팔을 벌린 길이. 선택 입력이며 3D 팔 길이에 쓴다 */
  reachCm?: number;
  /** 글러브 무게(oz). 펀치 충격 흡수 보정과 유효 질량에 쓴다 */
  gloveOz: GloveOz;
}

// ─────────────────────────────────────────────
// 근거가 붙은 숫자
// ─────────────────────────────────────────────

/**
 * 숫자의 근거.
 * research = 연구값, userInput = 사용자 입력값, estimated = 추정(앱이 어림한 값), noData = 자료 없음
 */
export type EstimateBasis = "research" | "userInput" | "estimated" | "noData";

/** 모든 결과 숫자는 이 모양으로 담아 근거·추정 범위·출처를 함께 들고 다닌다 */
export interface Estimate {
  /** null이면 "자료 없음". 숫자를 지어내지 않는다 */
  value: number | null;
  /** 추정 범위 아래 끝 */
  low?: number;
  /** 추정 범위 위 끝 */
  high?: number;
  basis: EstimateBasis;
  /** 근거로 쓴 연구의 id (lib/reference/sources.ts) */
  sourceIds: string[];
}

/** 몸무게가 들어가는 숫자는 계체량 기준과 리게인 추정 기준을 나란히 둔다 */
export interface ByWeight {
  /** 계체량 기준 */
  weighIn: Estimate;
  /** 리게인(+7.5%) 추정 기준 */
  regain: Estimate;
}

// ─────────────────────────────────────────────
// 타격 (단타·연타)
// ─────────────────────────────────────────────

/** 연타 목록의 한 칸 (단타는 한 칸짜리 목록) */
export interface StrikeStep {
  attacker: FighterId;
  technique: TechniqueId;
  side: StrikeSide;
  /** 노린 부위 */
  target: BodyPart;
  /** 닿는 순간 속도(m/s) */
  speedMps: number;
  /** 연구 기본값·범위 안에서 고른 값인지, 자료가 없어 사용자가 넣은 값인지 */
  speedBasis: "research" | "userInput";
  defense: Defense;
}

/** 움직임 (타격이 아니라 계산 숫자가 없다). 빽스텝 = 뒤로 한 걸음 물러나기 */
export type MoveId = "backStep";

/** 연타 목록의 움직임 한 칸 (사용자 요청: 빽스텝 뒤에 타격이 오면 앞으로 걸어 들어가 붙어서 친다) */
export interface MoveStep {
  kind: "move";
  /** 움직이는 선수 */
  fighter: FighterId;
  move: MoveId;
}

/** 연타 목록 한 칸: 타격 또는 움직임 */
export type ComboItem = StrikeStep | MoveStep;

/** 의학적 판단 하나 */
export interface MedicalJudgment {
  part: BodyPart;
  text: string;
  /** 근거로 쓴 연구의 id */
  sourceIds: string[];
  /** 힘이 아닌 기준을 힘으로 환산했거나 다른 부위 값을 빌렸으면 true ("추정" 표시) */
  estimated: boolean;
}

/** 타격 하나의 계산 결과 */
export interface StrikeResult {
  step: StrikeStep;
  /** 실제로 맞은 부위. 막혔으면 막은 부위(아래팔·정강이) */
  hitPart: BodyPart;
  outcome: "hit" | "blocked";
  /** 속도(m/s) */
  speed: Estimate;
  /** 운동량(kg·m/s) */
  momentum: ByWeight;
  /** 운동에너지(J) */
  energy: ByWeight;
  /** 추정 충격력(N). 펀치는 글러브 흡수를 반영한 값 */
  force: ByWeight;
  /** 타격 강도 지수(0~100). 공개 최고 충격력 기록 = 100, 기록이 없으면 "자료 없음" */
  intensityIndex: ByWeight;
  medical: MedicalJudgment;
  /** 재생 계획에서 정한 닿는 시각(초, 연타 시작 기준) */
  contactTimeSec: number;
}

// ─────────────────────────────────────────────
// 부위별 누적 충격
// ─────────────────────────────────────────────

/** 누적 색 단계. 0 = 기본색, 5 = 한계 힘 이상, null = 자료 없음(회색 빗금) */
export type ColorStep = 0 | 1 | 2 | 3 | 4 | 5 | null;

/**
 * 맞은 선수의 한 부위에 재생 시점까지 쌓인 충격.
 * 누적 비율 = 쌓인 충격력 합(리게인 기준) ÷ 그 부위의 한계 힘 × 100
 */
export interface PartLoad {
  defender: FighterId;
  part: BodyPart;
  /** 쌓인 충격력 합(N), 리게인 추정 기준·글러브 흡수 반영 */
  accumulatedForceN: number;
  /** 그 부위의 한계 힘(N). 힘이 아닌 기준을 바꿨으면 basis = "estimated" */
  thresholdN: Estimate;
  /** 한계 힘 대비 누적 비율(%). 한계 힘 자료가 없으면 null */
  ratioPct: number | null;
  colorStep: ColorStep;
}

// ─────────────────────────────────────────────
// 관절기 실험
// ─────────────────────────────────────────────

/** 관절기 6가지 (암바, 기무라·아메리카나, 니바, 힐훅·앵클록) */
export type JointLockId = "armbar" | "kimura" | "americana" | "kneebar" | "heelHook" | "ankleLock";

/** 관절기가 꺾는 관절 */
export type LockedJoint = "elbow" | "shoulder" | "knee" | "ankle";

export interface JointLockTrial {
  attacker: FighterId;
  lock: JointLockId;
  joint: LockedJoint;
  /** 사용자가 정한 꺾는 각도(°) */
  angleDeg: number;
  /** 정상 움직임 범위 끝(°) */
  normalRangeDeg: Estimate;
  /** 부상 기준 각도(°). 자료가 없으면 basis = "noData" */
  injuryDeg: Estimate;
}
