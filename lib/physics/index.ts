// Design Ref: §9 폴더 구조 — 물리 계산 함수를 한곳에서 불러오도록 모아 내보낸다
// 이 폴더의 함수는 화면 코드를 모른다 (의존 방향: components → lib/lab → lib/physics → lib/reference)
export * from "./body";
export * from "./effectiveMass";
export * from "./impact";
export * from "./thresholds";
