// 3D 선수 손에 끼우는 글러브 (선수 입력의 글러브 oz를 화면에 보이게)
// - 주먹 살(손·손가락에 붙은 캐릭터 점)의 크기를 재서, 그 바깥을 oz별 두께만큼 감싸는 둥근 상자 + 손목 띠로 그린다
// - 4oz는 종합격투기(MMA) 글러브로 보고 얇게, 0oz(맨손)는 그리지 않는다
// 두께·띠 길이 같은 숫자는 모두 보기 좋게 정한 그림용 값이다 (실제 글러브 치수 자료 없음, 계산에 쓰지 않음).
// 충격력 계산의 글러브 반영(무게·충격 흡수)은 lib/physics(effectiveMass.ts·impact.ts)가 따로 한다.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { GloveOz } from "@/lib/types";

/**
 * 주먹 모양 (손뼈 기준). 축: x = 손목→주먹 마디(치는 면 쪽), y = 새끼→검지, z = x × y.
 * 길이는 기본 체형 캐릭터의 m 단위.
 */
export interface FistShape {
  /** 주먹 살 상자의 가운데 (손뼈 기준 좌표) */
  center: THREE.Vector3;
  /** 주먹 축 방향 (손뼈 기준) */
  quaternion: THREE.Quaternion;
  /** 주먹 살 상자의 반 크기(m) */
  half: THREE.Vector3;
  /** 주먹 마디 관절(가운뎃손가락 시작점)에서 주먹 앞면까지(m, x축) */
  knuckleToFrontM: number;
  /** 잴 때 손뼈의 월드 배율 (손뼈 단위 → m) */
  boneScale: number;
}

/** oz별 글러브 모양 — 그림용 */
export interface GloveLook {
  /** 주먹을 감싸는 두께(m, 옆·위·아래) */
  padM: number;
  /** 치는 면(주먹 마디 앞) 두께(m) */
  frontPadM: number;
  /** 손목 띠 길이(m) */
  cuffM: number;
  /** 종합격투기 글러브(얇고 손목 띠가 짧음) */
  mma: boolean;
}

/** 글러브 oz별 모양. 맨손(0)이면 null. 무거울수록 솜이 두꺼워진다고 보고 oz에 비례해 늘린다 (그림용) */
export function gloveLook(oz: GloveOz): GloveLook | null {
  if (oz === 0) return null;
  if (oz === 4) return { padM: 0.006, frontPadM: 0.01, cuffM: 0.045, mma: true };
  const padM = 0.012 + 0.0015 * oz; // 8oz 2.4 cm … 16oz 3.6 cm
  return { padM, frontPadM: padM * 1.3, cuffM: 0.1, mma: false };
}

/** 글러브 색: 선수 색(A 빨강, B 파랑). 종합격투기 글러브는 검정 */
const GLOVE_COLORS = { A: 0xb91c1c, B: 0x1d4ed8, mma: 0x18181b };

/**
 * 손목 띠 자리 (팔뚝뼈 기준). 축: y = 손목→팔꿈치, x·z = 팔뚝 단면의 두 방향.
 * 길이는 기본 체형 캐릭터의 m 단위.
 */
export interface CuffShape {
  /** 손목 높이의 팔뚝 단면 가운데 (팔뚝뼈 기준 좌표) */
  center: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** 손목 근처 팔뚝 살의 반지름(m): x 방향, z 방향 */
  radiusX: number;
  radiusZ: number;
  /** 잴 때 팔뚝뼈의 월드 배율 */
  boneScale: number;
}

/** 손목 띠가 덮는 팔뚝 길이(m, 그림용) — 반지름을 잴 때도 이 범위의 살만 본다 */
export const CUFF_MEASURE_M = 0.12;

function gloveMaterial(look: GloveLook, team: "A" | "B") {
  return new THREE.MeshStandardMaterial({
    color: look.mma ? GLOVE_COLORS.mma : GLOVE_COLORS[team],
    roughness: 0.45,
    metalness: 0.05,
  });
}

/** 글러브 한 짝: 주먹 부분은 손뼈(hand_*)에, 손목 띠는 팔뚝뼈(lowerarm_*)에 붙인다 */
export function makeGlove(fist: FistShape, cuffShape: CuffShape, look: GloveLook, team: "A" | "B") {
  const material = gloveMaterial(look, team);

  // ── 주먹 부분 ──
  const hand = new THREE.Group();
  hand.name = "glove";
  hand.position.copy(fist.center);
  hand.quaternion.copy(fist.quaternion);
  // 안쪽 모양은 m 단위로 만들고, 손뼈 단위로 줄인다 (체형이 바뀌면 손뼈와 함께 커지고 작아진다)
  hand.scale.setScalar(1 / fist.boneScale);
  const { half } = fist;
  const sx = 2 * half.x + look.padM + look.frontPadM;
  const sy = 2 * (half.y + look.padM);
  const sz = 2 * (half.z + look.padM);
  const radius = Math.min(sx, sy, sz) * 0.42;
  const body = new THREE.Mesh(new RoundedBoxGeometry(sx, sy, sz, 4, radius), material);
  // 치는 면 쪽 두께가 더 두꺼우므로 그만큼 앞으로 민다
  body.position.x = (look.frontPadM - look.padM) / 2;
  body.castShadow = true;
  hand.add(body);

  // ── 손목 띠: 주먹 쪽은 글러브 굵기에서 시작해 팔꿈치 쪽으로 가늘어지고, 끝은 둥글게 말려 팔에 붙는다 ──
  const cuff = new THREE.Group();
  cuff.name = "glove-cuff";
  cuff.position.copy(cuffShape.center);
  cuff.quaternion.copy(cuffShape.quaternion);
  cuff.scale.setScalar(1 / cuffShape.boneScale);
  const r = Math.max(cuffShape.radiusX, cuffShape.radiusZ);
  const L = look.cuffM;
  const rGlove = Math.max(r + look.padM, Math.min(half.y, half.z) + look.padM * 0.5); // 주먹 쪽 굵기
  const rEnd = r + Math.max(0.005, look.padM * 0.35); // 팔꿈치 쪽 끝 굵기 (팔보다 조금 두껍게)
  const profile: THREE.Vector2[] = [new THREE.Vector2(0, -0.035), new THREE.Vector2(rGlove * 0.85, -0.03)];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = (1 - Math.cos(Math.PI * t)) / 2; // 부드럽게 가늘어지기
    profile.push(new THREE.Vector2(rGlove + (rEnd - rGlove) * k, -0.005 + (L - 0.015) * t));
  }
  // 끝 테두리: 살짝 부풀었다가 팔 안쪽으로 말려 들어가 끝이 잘려 보이지 않게
  profile.push(
    new THREE.Vector2(rEnd + 0.003, L - 0.008),
    new THREE.Vector2(rEnd + 0.002, L - 0.002),
    new THREE.Vector2(rEnd - 0.002, L + 0.002),
    new THREE.Vector2(r * 0.8, L + 0.003),
  );
  const sleeve = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), material);
  // 팔뚝 단면은 타원이라 두 방향 굵기에 맞춰 눌러 준다
  sleeve.scale.set(cuffShape.radiusX / r, 1, cuffShape.radiusZ / r);
  sleeve.castShadow = true;
  cuff.add(sleeve);

  return { hand, cuff };
}

/** 글러브 메모리 정리 */
export function disposeGlove(glove: THREE.Object3D) {
  glove.removeFromParent();
  glove.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
}
