// 연타 목록 다루기: 타격과 움직임(빽스텝)이 섞인 목록에서 타격만 고르거나 순서를 바꿔 센다.
// 움직임에는 계산 숫자가 없으므로 결과 목록은 타격만으로 만든다.

import type { ComboItem, MoveId, MoveStep, StrikeStep } from "../types";

/** 움직임 이름 */
export const MOVE_NAME_KO: Record<MoveId, string> = { backStep: "빽스텝" };

/** 이 칸이 움직임(빽스텝)인가 */
export function isMoveStep<T extends object>(item: T | MoveStep): item is MoveStep {
  return "kind" in item && item.kind === "move";
}

/** 목록에서 타격만 (결과 계산용) */
export function strikesOf(items: ComboItem[]): StrikeStep[] {
  return items.filter((it): it is StrikeStep => !isMoveStep(it));
}

/** 목록 index번째 칸이 타격이면, 그 타격이 타격만 센 순서로 몇 번째인지 (움직임이면 -1) */
export function strikeIndexOf(items: ComboItem[], index: number): number {
  if (index < 0 || index >= items.length || isMoveStep(items[index])) return -1;
  return strikesOf(items.slice(0, index)).length;
}
