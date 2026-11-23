// Design Ref: §3 데이터 모델 — 서버·데이터베이스 없이 브라우저 메모리에만 두는 데이터의 모양
// PLAN 작업 1: 선수, 영상 정보, 관절 위치, 타격, 관절기, 분석 결과의 모양을 정한다.
// 이 파일에는 계산 코드가 없고 "어떤 칸에 어떤 값이 들어가는지"만 정한다.

// ─────────────────────────────────────────────
// 공통으로 쓰는 작은 타입
// ─────────────────────────────────────────────

/** 선수 구분. 첫 장면에서 사용자가 클릭한 순서대로 A, B */
export type FighterId = "A" | "B";

/** 글러브 무게(oz). 0은 맨손, 4는 MMA 글러브 */
export type GloveOz = 0 | 4 | 8 | 10 | 12 | 14 | 16;

/** 성별. 분절 체중 비율표(de Leva 1996)가 남녀로 나뉘어 있어서 받는다 */
export type Sex = "male" | "female";

/** 신체 구역 (의학적 판단을 묶어 보여 줄 때 쓴다) */
export type BodyRegion = "head" | "torso" | "arm" | "leg";

/**
 * 맞은(또는 막은) 신체 부위 12곳. 누적 충격과 의학적 판단의 단위다.
 * 관절 찾기 도구의 어깨·팔꿈치·손목, 엉덩이·무릎·발목 위치로 구분한다.
 */
export type BodyPart =
  | "head" // 머리
  | "torsoFront" // 몸통 앞 (가슴·복부)
  | "flankLeft" // 왼쪽 옆구리
  | "flankRight" // 오른쪽 옆구리
  | "upperArmLeft" // 왼 위팔
  | "upperArmRight" // 오른 위팔
  | "forearmLeft" // 왼 아래팔
  | "forearmRight" // 오른 아래팔
  | "thighLeft" // 왼 허벅지
  | "thighRight" // 오른 허벅지
  | "lowerLegLeft" // 왼 종아리·정강이
  | "lowerLegRight"; // 오른 종아리·정강이

/** 영상 종류: 직접 찍은 영상 / 경기 영상 */
export type VideoKind = "self" | "match";

/** 훈련 종류. 경기 영상은 스파링 규칙으로 판정하므로 "sparring" */
export type TrainingType = "sparring" | "mitt" | "bag";

/** 오차 범위를 정하는 모드: 정밀(직접 찍은 영상 + 120fps 이상) / 일반 */
export type AnalysisMode = "precise" | "general";

/** 화면 위의 네모 영역 (영상 크기 대비 0~1 비율) */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─────────────────────────────────────────────
// 선수 입력값
// ─────────────────────────────────────────────

/**
 * 선수 정보. 첫 장면에서 선수를 클릭한 자리에서 입력받는다.
 * 리게인 몸무게는 저장하지 않고 weighInKg × 1.075로 계산한다.
 */
export interface Fighter {
  id: FighterId;
  /** 성별. 분절 체중 비율표의 남녀 값 중 어느 쪽을 쓸지 정한다 */
  sex: Sex;
  /** 계체량 몸무게(kg). 40~150만 받는다 */
  weighInKg: number;
  /** 키(cm). 화면 거리를 cm로 바꾸는 크기 기준 */
  heightCm: number;
  /** 리치(cm), 양팔을 벌린 길이. 선택 입력이며 팔 길이 보정에 쓴다 */
  reachCm?: number;
  /** 글러브 무게(oz). 펀치 충격 흡수 보정과 유효 질량에 쓴다 */
  gloveOz: GloveOz;
}

// ─────────────────────────────────────────────
// 영상 정보
// ─────────────────────────────────────────────

/** 첫 장면에서 사용자가 선수를 클릭한 위치 (영상 크기 대비 0~1 비율) */
export interface FighterPick {
  id: FighterId;
  x: number;
  y: number;
}

/** 분석 구간(초) */
export interface TimeRange {
  startSec: number;
  endSec: number;
}

export interface VideoInfo {
  kind: VideoKind;
  training: TrainingType;
  /** 직접 찍은 영상인데 30fps 근처로 측정되면 true → "늘어난 영상" 경고 */
  stretchedWarning: boolean;
  /** 웹에서 자동으로 측정한 fps */
  fps: number;
  mode: AnalysisMode;
  durationSec: number;
  range: TimeRange;
  /** 샌드백 영역. 샌드백 훈련일 때만 있고, 판정할 때 20% 넓혀서 본다 */
  bagArea?: Area;
  /** 첫 장면에서 클릭한 선수 위치 (최대 2명) */
  fighterPicks: FighterPick[];
}

// ─────────────────────────────────────────────
// 관절 위치
// ─────────────────────────────────────────────

/**
 * 관절 하나의 위치. 관절 찾기 도구가 장면마다 33개를 돌려준다.
 * x·y는 영상 크기 대비 0~1 비율, z는 깊이(상대값), visibility는 보이는 정도(0~1).
 */
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
  /** 화면 안에 있을 가능성 (0~1). 관절 찾기 도구가 주지 않으면 비어 있다 */
  presence?: number;
}

/** 한 장면에서 선수 한 명의 관절 33개 */
export interface FighterPose {
  fighterId: FighterId;
  landmarks: PoseLandmark[];
}

/** 한 장면(프레임)의 관절 위치. 지정한 선수만 담고 다른 사람은 버린다 */
export interface PoseFrame {
  timeSec: number;
  poses: FighterPose[];
}

// ─────────────────────────────────────────────
// 오차 범위가 붙은 숫자
// ─────────────────────────────────────────────

/** 모든 결과 숫자는 이 모양으로 담아 오차 범위를 함께 들고 다닌다 */
export interface Measured {
  /** null이면 "측정 불가". 숫자를 지어내지 않는다 */
  value: number | null;
  /** 오차 범위(%). 예: 7 → ±7% */
  errorPct?: number;
  /** 각도 오차(°) */
  errorDeg?: number;
}

/** 몸무게가 들어가는 숫자는 계체량 기준과 리게인 추정 기준을 나란히 둔다 */
export interface ByWeight {
  /** 계체량 기준 */
  weighIn: Measured;
  /** 리게인(+7.5%) 추정 기준 */
  regain: Measured;
}

// ─────────────────────────────────────────────
// 타격
// ─────────────────────────────────────────────

/** 의학적 판단 하나. 사람 몸은 맞은 부위 1개, 샌드백·미트는 머리·몸통 2개 */
export interface MedicalJudgment {
  part: BodyPart;
  text: string;
  /** 샌드백·미트 타격을 "사람이 맞았다면"으로 가정한 값이면 true */
  assumed: boolean;
  /** 근거로 쓴 연구의 id (참고값 자료 파일의 출처 id) */
  sourceIds: string[];
}

export interface Strike {
  fighterId: FighterId;
  timeSec: number;
  limb: "punch" | "kick";
  /** 성공 / 막힌 타격 */
  outcome: "hit" | "blocked";
  target: "body" | "bag" | "mitt";
  /** 사람 몸에 닿았을 때만 있다. 막힌 타격이면 막은 부위(아래팔, 정강이 등) */
  bodyPart?: BodyPart;
  /** 속도(m/s) */
  speed: Measured;
  /** 진행 방향 각도(°) */
  angle: Measured;
  /** 운동량(kg·m/s) */
  momentum: ByWeight;
  /** 운동에너지(J) */
  energy: ByWeight;
  /** 추정 충격력(N). 펀치는 글러브 흡수를 반영한 값 */
  force: ByWeight;
  /** 타격 강도 지수(0~100). 공개 최고 충격력 기록 = 100 */
  intensityIndex: ByWeight;
  /** false면 "측정 불가" (횟수에는 포함하고 수치는 비운다) */
  measurable: boolean;
  medical?: MedicalJudgment[];
}

// ─────────────────────────────────────────────
// 관절기
// ─────────────────────────────────────────────

export interface JointLock {
  attackerId: FighterId;
  timeSec: number;
  joint: "elbow" | "shoulder" | "knee" | "ankle";
  /** 회전 각도(°), 오차 ±10° */
  rotationDeg: Measured;
}

// ─────────────────────────────────────────────
// 분석 결과 전체
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// 부위별 누적 충격
// ─────────────────────────────────────────────

/**
 * 한 선수의 한 부위에 재생 시점까지 쌓인 충격.
 * 누적 비율 = 쌓인 충격력 합 ÷ 그 부위의 한계 힘 × 100
 */
export interface PartLoad {
  fighterId: FighterId;
  part: BodyPart;
  /** 쌓인 충격력 합(N), 리게인 추정 기준·글러브 흡수 반영 */
  accumulatedForceN: number;
  /** 그 부위의 한계 힘(N). 연구 기준을 힘으로 환산했으면 "환산 추정값" */
  thresholdN: Measured;
  /** 한계 힘 대비 누적 비율(%). 한계 힘 자료가 없으면 null */
  ratioPct: number | null;
}

export interface AnalysisResult {
  video: VideoInfo;
  fighters: Fighter[];
  strikes: Strike[];
  jointLocks: JointLock[];
  /** "측정 불가" 타격 수 */
  unmeasurableCount: number;
}
