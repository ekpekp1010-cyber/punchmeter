// Design Ref: §5.1 진행 방향 화살표 — 펀치·킥 화살표를 캔버스에 그린다 (영상 위 겹침 칸, 옆 칸 모두 사용)

import type { StrikeArrow } from "@/lib/engine/strikeArrows";

/** 화살표 하나 + 남아 있는 정도 (사라지는 중이면 1보다 작음) */
export interface FadingArrow extends StrikeArrow {
  alpha: number;
}

/**
 * @param width·height 캔버스 크기 (px)
 * @param colors 선수별 색 (0번 = 빨강, 1번 = 파랑)
 */
export function drawStrikeArrows(
  ctx: CanvasRenderingContext2D,
  arrows: FadingArrow[],
  width: number,
  height: number,
  colors: readonly string[],
): void {
  const unit = Math.min(width, height);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const a of arrows) {
    const color = colors[a.slot % colors.length];
    // 세기에 따라 길이·굵기를 키운다 (킥은 조금 더 굵게)
    const length = unit * (0.08 + 0.17 * a.strength);
    const thick = unit * (a.limb === "kick" ? 0.012 : 0.009) * (1 + a.strength);
    const x0 = a.x * width;
    const y0 = a.y * height;
    // 방향은 화면 높이 기준 단위 벡터라 그대로 픽셀 방향으로 쓴다
    const x1 = x0 + a.dirX * length;
    const y1 = y0 + a.dirY * length;
    const head = thick * 3.2;
    const angle = Math.atan2(y1 - y0, x1 - x0);

    ctx.globalAlpha = a.alpha;
    for (const pass of ["outline", "fill"] as const) {
      ctx.strokeStyle = pass === "outline" ? "rgba(0,0,0,0.75)" : color;
      ctx.fillStyle = ctx.strokeStyle;
      const extra = pass === "outline" ? thick * 0.6 : 0;
      // 몸통
      ctx.lineWidth = thick + extra * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - Math.cos(angle) * head * 0.6, y1 - Math.sin(angle) * head * 0.6);
      ctx.stroke();
      // 머리 (삼각형)
      ctx.lineWidth = extra * 2;
      ctx.beginPath();
      ctx.moveTo(x1 + Math.cos(angle) * extra, y1 + Math.sin(angle) * extra);
      ctx.lineTo(x1 - Math.cos(angle - 0.5) * head, y1 - Math.sin(angle - 0.5) * head);
      ctx.lineTo(x1 - Math.cos(angle + 0.5) * head, y1 - Math.sin(angle + 0.5) * head);
      ctx.closePath();
      ctx.fill();
      if (extra > 0) ctx.stroke();
    }
    // 이름표: 펀치 / 킥
    ctx.font = `bold ${Math.max(11, Math.round(unit * 0.03))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lx = x1 + a.dirX * unit * 0.035;
    const ly = y1 + a.dirY * unit * 0.035;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(a.limb === "punch" ? "펀치" : "킥", lx, ly);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(a.limb === "punch" ? "펀치" : "킥", lx, ly);
  }
  ctx.restore();
}
