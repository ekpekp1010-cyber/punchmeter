// 두 선수 몸이 서로 파고드는 깊이를 잰다 (공격자 → 상대 방향으로)
// 방법: 공격자→상대 방향을 앞(x)으로 보고, 키 높이 × 옆 위치를 4 cm 칸으로 나눈다.
//   칸마다 공격자 몸의 가장 앞쪽 점과 상대 몸의 가장 가까운(공격자 쪽) 점을 비교해,
//   공격자 점이 상대 점보다 더 앞에 있으면 그만큼 파고든 것이다.
// 두 선수가 마주 보고 서 있다는 점을 이용한 어림이며, 그림(겹침 막기)에만 쓴다.
// 타격하는 팔·다리는 상대에 닿는 것이 목적이므로 뺀다 (exclude).

import * as THREE from "three";
import type { FighterRig } from "./fighterRig";

const BIN_M = 0.04;
/** 성능을 위해 캐릭터 점을 몇 개마다 하나씩 볼지 */
const STRIDE = 2;

const _p = new THREE.Vector3();

/** 한 선수의 칸별 가장 앞(공격자) / 가장 가까운(상대) 위치 */
function scan(
  rig: FighterRig,
  e: THREE.Vector3,
  side: THREE.Vector3,
  pickMax: boolean,
  exclude: RegExp | null,
  out: Map<number, number>,
) {
  const put = (p: THREE.Vector3) => {
    const key = Math.round(p.y / BIN_M) * 10000 + Math.round(p.dot(side) / BIN_M);
    const x = p.dot(e);
    const cur = out.get(key);
    if (cur === undefined || (pickMax ? x > cur : x < cur)) out.set(key, x);
  };
  for (const mesh of rig.fighter.meshes) {
    if (/eyebrow|eyelash/i.test(mesh.name)) continue;
    const si = mesh.geometry.getAttribute("skinIndex");
    const sw = mesh.geometry.getAttribute("skinWeight");
    if (!si || !sw) continue;
    for (let i = 0; i < si.count; i += STRIDE) {
      if (exclude) {
        let best = 0;
        for (let j = 1; j < 4; j++) if (sw.getComponent(i, j) > sw.getComponent(i, best)) best = j;
        const bone = mesh.skeleton.bones[si.getComponent(i, best)];
        if (bone && exclude.test(bone.name)) continue;
      }
      put(mesh.localToWorld(mesh.getVertexPosition(i, _p)));
    }
  }
  // 글러브 (주먹·손목 띠)
  for (const g of rig.gloveMeshes()) {
    if (exclude && exclude.test(g.boneName)) continue;
    const pos = g.mesh.geometry.getAttribute("position");
    g.mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count; i += STRIDE) put(_p.fromBufferAttribute(pos, i).applyMatrix4(g.mesh.matrixWorld));
  }
}

/**
 * 공격자 몸이 상대 몸을 파고든 가장 큰 깊이(m). 겹치지 않으면 0 이하.
 * excludeAttacker: 공격자 쪽에서 뺄 뼈 이름 (타격하는 팔·다리)
 */
export function bodyOverlapDepth(attacker: FighterRig, defender: FighterRig, excludeAttacker: RegExp | null): number {
  const e = defender.fighter.root.position.clone().sub(attacker.fighter.root.position).setY(0).normalize();
  const side = new THREE.Vector3(-e.z, 0, e.x);
  const front = new Map<number, number>();
  const back = new Map<number, number>();
  scan(attacker, e, side, true, excludeAttacker, front);
  scan(defender, e, side, false, null, back);
  let depth = -Infinity;
  for (const [key, x] of front) {
    const y = back.get(key);
    if (y !== undefined) depth = Math.max(depth, x - y);
  }
  return depth;
}

/** 뼈 이름 규칙 여러 개 중 하나라도 맞으면 */
export function anyOf(...patterns: RegExp[]): RegExp {
  return new RegExp(patterns.map((p) => `(?:${p.source})`).join("|"));
}

/** 타격하는 팔(어깨부터 손가락까지)·다리(엉덩이부터 발끝까지)의 뼈 이름 */
export function limbBones(kind: "arm" | "leg", side: "l" | "r"): RegExp {
  const names = kind === "arm" ? "upperarm|lowerarm|hand|(index|middle|ring|pinky|thumb)_0\\d" : "thigh|calf|foot|ball";
  return new RegExp(`^(${names})_${side}$`);
}
