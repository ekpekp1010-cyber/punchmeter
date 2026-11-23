// Design Ref: §2.2 처리 ⑧ — 영상 속 위치와 속도를 다루는 2차원 벡터 계산
// 영상은 평면(2D)이라 x(가로)·y(세로) 두 방향만 다룬다. y는 화면 아래쪽이 +이다.

export interface Vec2 {
  x: number;
  y: number;
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

/** 길이가 1인 방향 벡터. 길이가 0이면 null */
export function unit(a: Vec2): Vec2 | null {
  const len = length(a);
  return len === 0 ? null : scale(a, 1 / len);
}
