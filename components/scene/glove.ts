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
  if (oz === 4) return { padM: 0.006, frontPadM: 0.01, cuffM: 0.04, mma: true };
  const padM = 0.012 + 0.0015 * oz; // 8oz 2.4 cm … 16oz 3.6 cm
  return { padM, frontPadM: padM * 1.3, cuffM: 0.09, mma: false };
}

/** 글러브 색: 선수 색(A 빨강, B 파랑). 종합격투기 글러브는 검정 */
const GLOVE_COLORS = { A: 0xb91c1c, B: 0x1d4ed8, mma: 0x18181b };

/** 글러브 한 짝을 만든다. 손뼈(hand_l / hand_r)에 자식으로 붙인다 */
export function makeGlove(shape: FistShape, look: GloveLook, team: "A" | "B"): THREE.Group {
  const group = new THREE.Group();
  group.name = "glove";
  group.position.copy(shape.center);
  group.quaternion.copy(shape.quaternion);
  // 안쪽 모양은 m 단위로 만들고, 손뼈 단위로 줄인다 (체형이 바뀌면 손뼈와 함께 커지고 작아진다)
  group.scale.setScalar(1 / shape.boneScale);

  const material = new THREE.MeshStandardMaterial({
    color: look.mma ? GLOVE_COLORS.mma : GLOVE_COLORS[team],
    roughness: 0.45,
    metalness: 0.05,
  });
  const { half } = shape;
  const sx = 2 * half.x + look.padM + look.frontPadM;
  const sy = 2 * (half.y + look.padM);
  const sz = 2 * (half.z + look.padM);
  const radius = Math.min(sx, sy, sz) * 0.42;
  const body = new THREE.Mesh(new RoundedBoxGeometry(sx, sy, sz, 4, radius), material);
  // 치는 면 쪽 두께가 더 두꺼우므로 그만큼 앞으로 민다
  body.position.x = (look.frontPadM - look.padM) / 2;
  body.castShadow = true;
  group.add(body);

  // 손목 띠: 주먹 상자 뒤끝에서 팔 쪽으로
  const cuffR = Math.max(half.y, half.z) * 0.85 + look.padM * 0.6;
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(cuffR, cuffR * 0.95, look.cuffM, 24, 1, true), material);
  cuff.rotation.z = Math.PI / 2; // 원기둥 축(y)을 x축으로
  cuff.position.x = -half.x - look.padM - look.cuffM / 2 + radius * 0.6;
  cuff.castShadow = true;
  group.add(cuff);
  return group;
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
