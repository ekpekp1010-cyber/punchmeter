// Design Ref: §2.2 "관절기 → 3D: 공격받는 관절을 그 각도로 돌리고 회전 화살표·각도 표시" (PLAN 작업 19)
// 두 선수가 엉키는 바닥 자세는 만들지 않고, 당하는 선수의 팔다리를 그 관절기 자세로 놓은 뒤 관절만 정한 각도로 꺾는다.
// 각도의 뜻은 lib/reference/jointLocks.ts의 정상 범위와 같다:
//   암바·니바 = 다 편 상태(0°)에서 더 젖힌 각도, 기무라 = 팔 90° 벌림에서 안쪽 돌림, 아메리카나 = 바깥쪽 돌림,
//   힐훅 = 정강이 안쪽 비틀기, 앵클록 = 발목 발바닥 굽힘 (발이 정강이와 직각인 자세가 0°)

import * as THREE from "three";
import type { JointLockId } from "@/lib/types";
import type { ArmSide, FighterRig } from "./fighterRig";

/** 관절기를 당하는 쪽 팔다리 (오른쪽) */
const SIDE: ArmSide = "r";

export interface JointArc {
  /** 관절 위치 (월드) */
  center: THREE.Vector3;
  /** 꺾기 전 방향 */
  from: THREE.Vector3;
  /** 꺾은 뒤 방향 */
  to: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** a를 b 쪽으로 deg만큼 돌린 방향 (a·b는 서로 수직인 길이 1 벡터) */
function turn(a: THREE.Vector3, b: THREE.Vector3, deg: number): THREE.Vector3 {
  const t = THREE.MathUtils.degToRad(deg);
  return a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t)).normalize();
}

/** v에서 axis 성분을 빼고 길이 1로 */
function perpendicular(v: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  return v.clone().addScaledVector(axis, -v.dot(axis)).normalize();
}

/**
 * 당하는 선수(rig)를 관절기 자세로 놓는다 (beginFrame 뒤에 부른다). 회전 화살표용 관절·방향을 돌려준다.
 */
export function poseJointLock(rig: FighterRig, lock: JointLockId, angleDeg: number): JointArc {
  const s = SIDE;
  const f = rig.forward();
  const out = rig.outward(s);
  rig.setTwist(0);
  rig.guard(lock === "armbar" || lock === "kimura" || lock === "americana" ? s : undefined);

  switch (lock) {
    case "armbar": {
      // 팔을 앞으로 곧게 뻗고, 팔꿈치를 다 편 상태에서 아래로 더 젖힌다
      const shoulder = rig.shoulder(s);
      const { upper, lower } = rig.armLengths(s);
      const elbow = shoulder.clone().addScaledVector(f, upper);
      rig.aimBone(`upperarm_${s}`, `lowerarm_${s}`, elbow);
      const dir = turn(f, DOWN, angleDeg);
      rig.aimBone(`lowerarm_${s}`, `hand_${s}`, elbow.clone().addScaledVector(dir, lower));
      rig.aimBone(`hand_${s}`, `middle_01_${s}`, elbow.clone().addScaledVector(dir, lower + 0.1));
      return { center: elbow, from: f, to: dir };
    }
    case "kimura":
    case "americana": {
      // 팔을 옆으로 90° 벌리고 팔꿈치 90°. 아래팔이 앞을 볼 때가 0°, 기무라는 아래로(안쪽 돌림), 아메리카나는 위로(바깥쪽 돌림)
      const shoulder = rig.shoulder(s);
      const { upper, lower } = rig.armLengths(s);
      const elbow = shoulder.clone().addScaledVector(out, upper);
      rig.aimBone(`upperarm_${s}`, `lowerarm_${s}`, elbow);
      const dir = turn(f, lock === "kimura" ? DOWN : UP, angleDeg);
      rig.aimBone(`lowerarm_${s}`, `hand_${s}`, elbow.clone().addScaledVector(dir, lower));
      rig.aimBone(`hand_${s}`, `middle_01_${s}`, elbow.clone().addScaledVector(dir, lower + 0.1));
      return { center: elbow, from: f, to: dir };
    }
    case "kneebar":
    case "ankleLock": {
      // 다리를 앞으로 들어 곧게 편다 (니바: 무릎을 위로 더 젖힘 / 앵클록: 발끝을 정강이 쪽으로 펴기)
      const hip = rig.hip(s);
      const { thigh, shank } = rig.legLengths(s);
      const thighDir = f.clone().addScaledVector(DOWN, 0.35).normalize();
      const knee = hip.clone().addScaledVector(thighDir, thigh);
      rig.aimBone(`thigh_${s}`, `calf_${s}`, knee);
      const upPerp = perpendicular(UP, thighDir);
      const shinDir = lock === "kneebar" ? turn(thighDir, upPerp, angleDeg) : thighDir;
      const ankle = knee.clone().addScaledVector(shinDir, shank);
      rig.aimBone(`calf_${s}`, `foot_${s}`, ankle);
      // 발: 정강이와 직각(발등이 위)이 0°, 앵클록은 정강이 방향으로 펴진다
      const footNeutral = perpendicular(UP, shinDir);
      const footDir = lock === "ankleLock" ? turn(footNeutral, shinDir, angleDeg) : footNeutral;
      rig.aimBone(`foot_${s}`, `ball_${s}`, ankle.clone().addScaledVector(footDir, 0.1));
      return lock === "kneebar"
        ? { center: knee, from: thighDir, to: shinDir }
        : { center: ankle, from: footNeutral, to: footDir };
    }
    case "heelHook": {
      // 다리를 앞으로 들고 무릎 90°(정강이는 아래), 정강이를 제 축으로 안쪽(몸 가운데 쪽)으로 비튼다
      const hip = rig.hip(s);
      const { thigh, shank } = rig.legLengths(s);
      const knee = hip.clone().addScaledVector(f, thigh);
      rig.aimBone(`thigh_${s}`, `calf_${s}`, knee);
      rig.aimBone(`calf_${s}`, `foot_${s}`, knee.clone().addScaledVector(DOWN, shank));
      const ankle = rig.pos(`foot_${s}`);
      rig.aimBone(`foot_${s}`, `ball_${s}`, ankle.clone().addScaledVector(f, 0.1));
      const toeBefore = rig.pos(`ball_${s}`).sub(ankle).setY(0).normalize();
      // 안쪽 = 몸 가운데 쪽 (오른발이면 선수의 왼쪽)
      const inward = out.clone().negate();
      rig.rotateBone(`calf_${s}`, DOWN, THREE.MathUtils.degToRad(angleDeg));
      let toeAfter = rig.pos(`ball_${s}`).sub(rig.pos(`foot_${s}`)).setY(0).normalize();
      if (toeAfter.dot(inward) < toeBefore.dot(inward) && angleDeg > 0) {
        rig.rotateBone(`calf_${s}`, DOWN, -2 * THREE.MathUtils.degToRad(angleDeg));
        toeAfter = rig.pos(`ball_${s}`).sub(rig.pos(`foot_${s}`)).setY(0).normalize();
      }
      return { center: rig.pos(`foot_${s}`), from: toeBefore, to: toeAfter };
    }
  }
}

/** 관절 둘레 회전 화살표 (꺾기 전 방향 → 꺾은 뒤 방향) */
export class JointArrow {
  private readonly scene: THREE.Scene;
  private group: THREE.Group | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  show(arc: JointArc, radius: number, over: boolean) {
    this.clear();
    const angle = arc.from.angleTo(arc.to);
    if (angle < THREE.MathUtils.degToRad(2)) return;
    const axis = new THREE.Vector3().crossVectors(arc.from, arc.to).normalize();
    const points: THREE.Vector3[] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (angle * i) / steps);
      points.push(arc.center.clone().addScaledVector(arc.from.clone().applyQuaternion(q), radius));
    }
    const color = over ? 0xef4444 : 0xfacc15;
    const material = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, radius * 0.06, 8, false), material);
    const end = points[points.length - 1];
    const tangent = end.clone().sub(points[points.length - 2]).normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.16, radius * 0.4, 16), material);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    cone.position.copy(end);
    const group = new THREE.Group();
    group.add(tube, cone);
    group.renderOrder = tube.renderOrder = cone.renderOrder = 11;
    this.scene.add(group);
    this.group = group;
  }

  clear() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.group = null;
  }
}
