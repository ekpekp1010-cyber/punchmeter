// Design Ref: §5.1 진행 방향 화살표 — 상대 몸에 닿은 펀치·킥만 화살표로 그린다 (영상 위 겹침 칸, 옆 칸 모두 사용)

import type { StrikeContact, TargetRegion } from "@/lib/engine/contact";

/** 화살표 하나 + 남아 있는 정도 (사라지는 중이면 1보다 작음) */
export interface FadingArrow extends StrikeContact {
  alpha: number;
}

const REGION_LABEL: Record<TargetRegion, string> = { head: "머리", torso: "몸통", arm: "팔", leg: "다리" };

/** 이름표: "펀치 · 머리", 막혔으면 "킥 · 막힘" */
export function arrowLabel(a: StrikeContact): string {
  const limb = a.limb === "punch" ? "펀치" : "킥";
  return a.outcome === "blocked" ? `${limb} · 막힘` : `${limb} · ${REGION_LABEL[a.region]}`;
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
    const blocked = a.outcome === "blocked";
    // 세기에 따라 길이·굵기를 키운다 (킥은 조금 더 굵게)
    const length = unit * (0.08 + 0.17 * a.strength);
    const thick = unit * (a.limb === "kick" ? 0.012 : 0.009) * (1 + a.strength);
    // 화살표 끝이 닿은 곳(주먹·발 위치)에 오도록, 진행 방향의 반대쪽에서 시작한다
    const x1 = a.x * width;
    const y1 = a.y * height;
    const x0 = x1 - a.dirX * length;
    const y0 = y1 - a.dirY * length;
    const head = thick * 3.2;
    const angle = Math.atan2(y1 - y0, x1 - x0);

    // 막힌 타격은 흐리고 점선으로
    ctx.globalAlpha = a.alpha * (blocked ? 0.7 : 1);
    for (const pass of ["outline", "fill"] as const) {
      ctx.strokeStyle = pass === "outline" ? "rgba(0,0,0,0.75)" : color;
      ctx.fillStyle = ctx.strokeStyle;
      const extra = pass === "outline" ? thick * 0.6 : 0;
      ctx.setLineDash(blocked ? [thick * 1.5, thick * 1.2] : []);
      ctx.lineWidth = thick + extra * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - Math.cos(angle) * head * 0.6, y1 - Math.sin(angle) * head * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = extra * 2;
      ctx.beginPath();
      ctx.moveTo(x1 + Math.cos(angle) * extra, y1 + Math.sin(angle) * extra);
      ctx.lineTo(x1 - Math.cos(angle - 0.5) * head, y1 - Math.sin(angle - 0.5) * head);
      ctx.lineTo(x1 - Math.cos(angle + 0.5) * head, y1 - Math.sin(angle + 0.5) * head);
      ctx.closePath();
      ctx.fill();
      if (extra > 0) ctx.stroke();
    }
    // 이름표: 화살표 꼬리 쪽에 ("펀치 · 머리" 등)
    const label = arrowLabel(a);
    ctx.font = `bold ${Math.max(11, Math.round(unit * 0.03))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lx = x0 - a.dirX * unit * 0.04;
    const ly = y0 - a.dirY * unit * 0.04;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, lx, ly);
  }
  ctx.restore();
}
