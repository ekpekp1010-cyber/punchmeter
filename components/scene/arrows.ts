// Design Ref: §5.4 "닿는 순간 진행 방향 화살표 (빠를수록 길고 굵게)" (PLAN 작업 15)
// 닿는 순간 끝점의 실제 진행 방향으로 화살표를 그린다. 화살표 끝(뾰족한 곳)이 닿은 자리에 온다.
// 길이·굵기는 속도에 비례하는 그림용 값이고, 맞으면 빨강·막히면 파랑. 잠시 뒤 흐려지며 사라진다.

import * as THREE from "three";

/** 화살표 크기 (그림용): 길이 = BASE + PER_MPS × 속도, 굵기도 속도에 비례 */
const LENGTH_BASE_M = 0.12;
const LENGTH_PER_MPS = 0.025;
const RADIUS_BASE_M = 0.008;
const RADIUS_PER_MPS = 0.0012;
/** 화면에 머무는 시간(초, 실제 시간) */
const SHOW_SEC = 3;
const FADE_SEC = 0.8;

interface Live {
  group: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  age: number;
}

export class ArrowLayer {
  private readonly scene: THREE.Scene;
  private readonly live: Live[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** 닿은 곳(tip)에 진행 방향(dir) 화살표를 놓는다 */
  add(tip: THREE.Vector3, dir: THREE.Vector3, speedMps: number, blocked: boolean) {
    const length = LENGTH_BASE_M + LENGTH_PER_MPS * speedMps;
    const radius = RADIUS_BASE_M + RADIUS_PER_MPS * speedMps;
    const headLength = Math.min(length * 0.35, 0.09);
    const color = blocked ? 0x38bdf8 : 0xef4444;
    const material = () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const shaftMat = material();
    const headMat = material();

    // 원기둥·원뿔은 Y축 방향으로 만들어지므로, Y가 진행 방향이 되게 돌린다
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length - headLength, 16), shaftMat);
    shaft.position.y = (length - headLength) / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.4, headLength, 20), headMat);
    head.position.y = length - headLength / 2;

    const group = new THREE.Group();
    group.add(shaft, head);
    group.renderOrder = 10; // 몸에 가려지지 않게 맨 위에 그린다
    shaft.renderOrder = head.renderOrder = 10;
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    group.position.copy(tip).addScaledVector(dir.clone().normalize(), -length);
    this.scene.add(group);
    this.live.push({ group, materials: [shaftMat, headMat], age: 0 });
  }

  /** 매 장면 (실제 시간 dt): 오래된 화살표를 흐리게 하다가 지운다 */
  update(dtSec: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const a = this.live[i];
      a.age += dtSec;
      const fadeStart = SHOW_SEC - FADE_SEC;
      if (a.age > fadeStart) for (const m of a.materials) m.opacity = 0.95 * Math.max(0, 1 - (a.age - fadeStart) / FADE_SEC);
      if (a.age >= SHOW_SEC) {
        this.remove(a);
        this.live.splice(i, 1);
      }
    }
  }

  clear() {
    for (const a of this.live) this.remove(a);
    this.live.length = 0;
  }

  get count(): number {
    return this.live.length;
  }

  private remove(a: Live) {
    this.scene.remove(a.group);
    a.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of a.materials) m.dispose();
  }
}
