// Design Ref: §4.5 동작을 만드는 방법 — 선수 한 명의 뼈를 코드로 움직이는 장치 (PLAN 작업 11)
// - 매 장면 처음 자세(쉬는 자세)로 되돌린 뒤 몸통 회전 → 팔 IK 순서로 다시 놓는다 (비틀림이 쌓이지 않게)
// - 주먹 쥐기: 손가락 뼈를 손바닥 쪽으로 굽힌 자세를 한 번 계산해 두고 늘 쓴다
// - 부위 22곳 위치: models.json의 표면 점에 가장 가까운 캐릭터 점을 찾아 두고, 체형·자세가 바뀌어도 그 점을 따라간다
// 가드 위치·회전 각도 같은 숫자는 보기 좋게 정한 그림용 값이다 (계산에 쓰지 않음).

import * as THREE from "three";
import { solveTwoBone } from "@/lib/motion/ik";
import type { ModelInfo } from "@/lib/motion/bodyShape";
import type { BodyPart } from "@/lib/types";
import type { StageFighter } from "./stage";

export type ArmSide = "l" | "r";

/** 오소독스 자세: 왼쪽이 앞손·앞발 */
export const LEAD_SIDE: ArmSide = "l";

/** 기본 자세에서 몸통을 비트는 각도(°, 왼 어깨가 앞으로) — 그림용 */
const STANCE_TWIST_DEG = -12;
/** 목이 몸통 회전을 되돌리는 비율 (얼굴은 상대를 보게) */
const NECK_COUNTER = 0.7;
/** 주먹 쥐기 각도(°) — 그림용 */
const FINGER_CURL_DEG = [70, 80, 60];
const THUMB_CURL_DEG = 35;
const FINGERS = ["index", "middle", "ring", "pinky"];

interface Anchor {
  mesh: THREE.SkinnedMesh;
  index: number;
  /** 부위를 치는 쪽 방향 (모델 기준, 몸 바깥쪽) */
  from: THREE.Vector3;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

export class FighterRig {
  readonly fighter: StageFighter;
  private readonly rest = new Map<THREE.Bone, THREE.Quaternion>();
  private readonly fist = new Map<THREE.Bone, THREE.Quaternion>();
  private readonly anchors = new Map<BodyPart, Anchor>();

  constructor(fighter: StageFighter, info: ModelInfo) {
    this.fighter = fighter;
    for (const bone of fighter.bones.values()) this.rest.set(bone, bone.quaternion.clone());
    fighter.model.updateMatrixWorld(true);
    this.findAnchors(info);
    // 오른손에서 손가락 굽히는 축을 구하고, 왼손은 좌우 대칭(모델 X축 거울)으로 쓴다.
    // 회전축은 거울에 비치면 (x, y, z) → (x, −y, −z)가 된다. 이때 선수는 원점에서 회전 없이 서 있다.
    const rightAxis = this.fistAxis("r");
    this.computeFist("r", rightAxis);
    this.computeFist("l", new THREE.Vector3(rightAxis.x, -rightAxis.y, -rightAxis.z));
  }

  private bone(name: string): THREE.Bone {
    const b = this.fighter.bones.get(name);
    if (!b) throw new Error(`뼈가 없습니다: ${name}`);
    return b;
  }

  /** 뼈의 월드 위치 */
  pos(name: string, target = new THREE.Vector3()): THREE.Vector3 {
    return this.bone(name).getWorldPosition(target);
  }

  // ── 부위 위치 ──

  /** models.json 표면 점에 가장 가까운 캐릭터 점을 찾는다 (처음 한 번, 쉬는 자세, 모델 기준 좌표로 비교) */
  private findAnchors(info: ModelInfo) {
    const model = this.fighter.model;
    const candidates = this.fighter.meshes.filter((m) => !/eyebrow|eyelash|high-poly/i.test(m.name));
    const p = new THREE.Vector3();
    for (const [part, a] of Object.entries(info.anchors) as [BodyPart, ModelInfo["anchors"][BodyPart]][]) {
      const goal = new THREE.Vector3(...a.pos);
      let best: { mesh: THREE.SkinnedMesh; index: number; d: number } | null = null;
      for (const mesh of candidates) {
        const count = mesh.geometry.getAttribute("position").count;
        for (let i = 0; i < count; i++) {
          mesh.getVertexPosition(i, p);
          model.worldToLocal(mesh.localToWorld(p));
          const d = p.distanceToSquared(goal);
          if (!best || d < best.d) best = { mesh, index: i, d };
        }
      }
      if (best) this.anchors.set(part, { mesh: best.mesh, index: best.index, from: new THREE.Vector3(...a.from) });
    }
  }

  /** 부위 표면 위치 (월드) — 체형 변형·자세를 따라간다 */
  partWorld(part: BodyPart, target = new THREE.Vector3()): THREE.Vector3 {
    const a = this.anchors.get(part);
    if (!a) throw new Error(`부위 위치가 없습니다: ${part}`);
    a.mesh.getVertexPosition(a.index, target);
    return a.mesh.localToWorld(target);
  }

  /** 부위를 치는 쪽 방향 (월드, 몸 바깥쪽) */
  partFrom(part: BodyPart, target = new THREE.Vector3()): THREE.Vector3 {
    const a = this.anchors.get(part);
    if (!a) throw new Error(`부위 위치가 없습니다: ${part}`);
    return target.copy(a.from).transformDirection(this.fighter.model.matrixWorld);
  }

  // ── 방향 ──

  /** 선수가 바라보는 앞 (월드) */
  forward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(0, 0, 1).transformDirection(this.fighter.model.matrixWorld);
  }

  /** 선수 본인의 왼쪽 (월드) */
  left(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(1, 0, 0).transformDirection(this.fighter.model.matrixWorld);
  }

  /** 팔 바깥쪽 (왼팔이면 왼쪽) */
  outward(side: ArmSide, target = new THREE.Vector3()): THREE.Vector3 {
    this.left(target);
    return side === "l" ? target : target.negate();
  }

  /** 캐릭터 크기 배율 */
  get scale(): number {
    return this.fighter.model.scale.x;
  }

  // ── 자세 ──

  /** 모든 뼈를 쉬는 자세로 되돌리고 주먹을 쥔다 (뼈 크기는 그대로) */
  beginFrame() {
    for (const [bone, q] of this.rest) bone.quaternion.copy(q);
    for (const [bone, q] of this.fist) bone.quaternion.copy(q);
    this.fighter.model.updateMatrixWorld(true);
  }

  /** 뼈를 월드 기준으로 axis 축 둘레로 돌린다 */
  private rotateWorld(bone: THREE.Bone, axis: THREE.Vector3, angleRad: number) {
    const parentQ = bone.parent ? bone.parent.getWorldQuaternion(_q1) : _q1.identity();
    const worldQ = bone.getWorldQuaternion(_q2);
    worldQ.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angleRad));
    bone.quaternion.copy(parentQ.invert().multiply(worldQ));
    bone.updateMatrixWorld(true);
  }

  /** 몸통 비틀기(°, +면 오른 어깨가 앞으로). 기본 자세 비틀기에 더한다. 목은 반대로 돌려 상대를 본다 */
  setTwist(extraDeg: number) {
    const up = _v1.set(0, 1, 0);
    const total = THREE.MathUtils.degToRad(STANCE_TWIST_DEG + extraDeg);
    this.rotateWorld(this.bone("spine_01"), up, total);
    this.rotateWorld(this.bone("neck_01"), up, -total * NECK_COUNTER);
  }

  /** bone을 돌려 child가 point를 향하게 한다 (가장 짧은 회전) */
  private aim(bone: THREE.Bone, child: THREE.Bone, point: THREE.Vector3) {
    const base = bone.getWorldPosition(new THREE.Vector3());
    const cur = child.getWorldPosition(new THREE.Vector3()).sub(base).normalize();
    const want = point.clone().sub(base).normalize();
    if (cur.lengthSq() < 1e-12 || want.lengthSq() < 1e-12) return;
    const rot = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const worldQ = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(rot);
    bone.quaternion.copy(parentQ.invert().multiply(worldQ));
    bone.updateMatrixWorld(true);
  }

  /** 팔 길이(월드): 위팔, 아래팔, 손목~주먹 마디 */
  armLengths(side: ArmSide) {
    const s = this.pos(`upperarm_${side}`);
    const e = this.pos(`lowerarm_${side}`);
    const w = this.pos(`hand_${side}`);
    const k = this.pos(`middle_01_${side}`);
    return { upper: s.distanceTo(e), lower: e.distanceTo(w), hand: w.distanceTo(k) };
  }

  /** 어깨 위치 (월드) */
  shoulder(side: ArmSide, target = new THREE.Vector3()): THREE.Vector3 {
    return this.pos(`upperarm_${side}`, target);
  }

  /** 팔꿈치가 향할 쪽: 가드·직선 펀치는 아래·바깥·뒤, 훅은 바깥 (raise 0~1) */
  elbowPole(side: ArmSide, raise = 0): THREE.Vector3 {
    const s = this.shoulder(side);
    const out = this.outward(side);
    const back = this.forward().negate();
    const down = _v2.set(0, -1, 0);
    const guardPole = s.clone().addScaledVector(down, 1).addScaledVector(out, 0.3).addScaledVector(back, 0.3);
    const hookPole = s.clone().addScaledVector(out, 1).addScaledVector(down, 0.25);
    return guardPole.lerp(hookPole, raise);
  }

  /** 주먹 마디(가운뎃손가락 시작점)를 target에 놓도록 팔을 푼다. 닿았는지 돌려준다 */
  reachArm(side: ArmSide, target: THREE.Vector3, pole: THREE.Vector3): boolean {
    const { upper, lower, hand } = this.armLengths(side);
    const S = this.shoulder(side);
    const r = solveTwoBone(S, target, upper, lower + hand, pole);
    this.aim(this.bone(`upperarm_${side}`), this.bone(`lowerarm_${side}`), r.joint);
    const dir = r.end.clone().sub(r.joint).normalize();
    const wrist = r.joint.clone().addScaledVector(dir, lower);
    this.aim(this.bone(`lowerarm_${side}`), this.bone(`hand_${side}`), wrist);
    this.aim(this.bone(`hand_${side}`), this.bone(`middle_01_${side}`), r.end);
    return r.reached;
  }

  /**
   * 가드 자리 (월드): 앞손은 얼굴 앞, 뒷손은 턱 옆.
   * lowered면 가드를 가슴 높이로 내린다 (수비 "맞음"일 때 맞는 선수 — 주먹이 노린 곳에 닿는 모습이 가리지 않게)
   */
  guardPoint(side: ArmSide, target = new THREE.Vector3(), lowered = false): THREE.Vector3 {
    const s = this.scale;
    const jaw = this.partWorld("jaw", target);
    const f = this.forward();
    const left = this.left();
    const lead = side === LEAD_SIDE;
    const sideSign = side === "l" ? 1 : -1;
    jaw
      .addScaledVector(f, (lead ? 0.24 : 0.14) * s)
      .addScaledVector(left, sideSign * (lead ? 0.1 : 0.13) * s)
      .addScaledVector(_v1.set(0, 1, 0), (lead ? 0.0 : 0.01) * s);
    if (lowered) jaw.addScaledVector(_v1.set(0, 1, 0), -0.32 * s).addScaledVector(left, sideSign * 0.08 * s).addScaledVector(f, -0.06 * s);
    return jaw;
  }

  /** 가드 자세로 팔을 놓는다 (skip에 든 팔은 건너뜀, lowered면 가슴 높이로 내린 가드) */
  guard(skip?: ArmSide, lowered = false) {
    for (const side of ["l", "r"] as const) {
      if (side === skip) continue;
      this.reachArm(side, this.guardPoint(side, new THREE.Vector3(), lowered), this.elbowPole(side));
    }
  }

  // ── 주먹 쥐기 ──

  /** 손가락을 손바닥 쪽으로 굽히는 회전축 (월드): 손가락 마디를 잇는 축, 엄지가 있는 쪽으로 굽게 방향을 고른다 */
  private fistAxis(side: ArmSide): THREE.Vector3 {
    const hand = this.pos(`hand_${side}`);
    const idx = this.pos(`index_01_${side}`);
    const pinky = this.pos(`pinky_01_${side}`);
    const mid = this.pos(`middle_01_${side}`);
    const thumb = this.pos(`thumb_02_${side}`);
    const across = idx.clone().sub(pinky).normalize(); // 손가락 마디를 잇는 축
    const along = mid.clone().sub(hand).normalize(); // 손가락 방향
    // 손바닥 쪽: 엄지가 있는 쪽에서 두 축 성분을 뺀 방향
    const palm = thumb.clone().sub(hand);
    palm.addScaledVector(along, -palm.dot(along)).addScaledVector(across, -palm.dot(across)).normalize();
    // across 축으로 +각도 돌리면 손가락이 (across × along) 쪽으로 간다 → 그쪽이 손바닥이 되게 축 방향을 고른다
    return new THREE.Vector3().crossVectors(across, along).dot(palm) >= 0 ? across : across.clone().negate();
  }

  /** 손가락을 손바닥 쪽으로 굽힌 자세를 쉬는 자세 기준으로 계산해 둔다 */
  private computeFist(side: ArmSide, axis: THREE.Vector3) {
    for (const finger of FINGERS) {
      FINGER_CURL_DEG.forEach((deg, i) => {
        const bone = this.fighter.bones.get(`${finger}_0${i + 1}_${side}`);
        if (bone) this.rotateWorld(bone, axis, THREE.MathUtils.degToRad(deg));
      });
    }
    for (const n of ["02", "03"]) {
      const bone = this.fighter.bones.get(`thumb_${n}_${side}`);
      if (bone) this.rotateWorld(bone, axis, THREE.MathUtils.degToRad(THUMB_CURL_DEG));
    }
    for (const bone of this.fighter.bones.values()) {
      if (/^(index|middle|ring|pinky|thumb)_0\d_[lr]$/.test(bone.name)) this.fist.set(bone, bone.quaternion.clone());
    }
  }
}
