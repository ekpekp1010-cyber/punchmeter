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

/** 오소독스 자세 (두 선수 모두 오른손잡이로 가정): 왼쪽이 앞손·앞발 */
export const LEAD_SIDE: ArmSide = "l";

/**
 * 서 있는 자세 (오소독스: 왼발 앞, 오른발 뒤) — 모두 그림용 값, 기본 체형(m) 기준.
 * 매 장면 처음(beginFrame)에 이 자세로 서고, 타격 중에도 차는 발이 아니면 이 자리를 지킨다.
 */
const STANCE = {
  /** 앞발(왼발)을 앞으로, 뒷발(오른발)을 뒤로 옮기는 거리 */
  stepM: 0.18,
  /** 발을 몸 가운데 쪽으로 모으는 거리 (쉬는 자세는 두 발이 어깨보다 넓다) */
  inwardM: { l: 0.06, r: 0.02 } as Record<"l" | "r", number>,
  /** 무릎을 살짝 굽히려고 몸을 낮추는 높이 */
  dropM: 0.04,
  /** 골반 비틀기(°, −면 왼쪽 엉덩이가 앞으로) */
  hipTwistDeg: -20,
  /** 발끝 방향(°, 위에서 볼 때 +면 선수 왼쪽으로 돈다): 앞발은 살짝 안쪽, 뒷발은 바깥으로 */
  toeYawDeg: { l: -15, r: -45 } as Record<"l" | "r", number>,
};

/** 기본 자세에서 몸통(척추)을 골반보다 더 비트는 각도(°, 왼 어깨가 앞으로) — 그림용 */
const STANCE_TWIST_DEG = -8;
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
  /** 쉬는 자세의 발목 위치·발목→발볼 방향 (모델 기준 좌표) — 서는 자세의 발 자리를 정한다 */
  private readonly restAnkle = { l: new THREE.Vector3(), r: new THREE.Vector3() };
  private readonly restToe = { l: new THREE.Vector3(), r: new THREE.Vector3() };

  constructor(fighter: StageFighter, info: ModelInfo) {
    this.fighter = fighter;
    for (const bone of fighter.bones.values()) this.rest.set(bone, bone.quaternion.clone());
    fighter.model.updateMatrixWorld(true);
    for (const side of ["l", "r"] as const) {
      fighter.model.worldToLocal(this.pos(`foot_${side}`, this.restAnkle[side]));
      const ball = fighter.model.worldToLocal(this.pos(`ball_${side}`));
      this.restToe[side].copy(ball).sub(this.restAnkle[side]);
    }
    this.findAnchors(info);
    this.assignVertexParts(info);
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

  // ── 부위 색칠 (PLAN 작업 18) ──
  // 캐릭터 표면의 점마다 가장 가까운 부위 위치(쉬는 자세, 모델 좌표)를 찾아 그 부위에 배정한다.
  // 어느 부위에서도 PART_RADIUS_M보다 멀면(손·발·등 일부 등) 칠하지 않는다.

  /** 부위 하나가 칠해지는 반경(m, 모델 기준) — 그림용 */
  static readonly PART_RADIUS_M = 0.13;
  private readonly partOfVertex = new Map<THREE.SkinnedMesh, Int8Array>();
  private readonly partList: BodyPart[] = [];

  private assignVertexParts(info: ModelInfo) {
    const model = this.fighter.model;
    const anchors = Object.entries(info.anchors) as [BodyPart, ModelInfo["anchors"][BodyPart]][];
    this.partList.push(...anchors.map(([p]) => p));
    const points = anchors.map(([, a]) => new THREE.Vector3(...a.pos));
    const r2 = FighterRig.PART_RADIUS_M ** 2;
    const p = new THREE.Vector3();
    for (const mesh of this.fighter.meshes) {
      if (/eyebrow|eyelash|high-poly/i.test(mesh.name)) continue;
      const count = mesh.geometry.getAttribute("position").count;
      const parts = new Int8Array(count).fill(-1);
      for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, p);
        model.worldToLocal(mesh.localToWorld(p));
        let best = -1;
        let bestD = r2;
        for (let k = 0; k < points.length; k++) {
          const d = p.distanceToSquared(points[k]);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        parts[i] = best;
      }
      this.partOfVertex.set(mesh, parts);
      // 정점 색(기본 흰색 = 원래 피부색)을 곱해 칠한다
      mesh.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of materials) {
        (m as THREE.MeshStandardMaterial).vertexColors = true;
        m.needsUpdate = true;
      }
    }
  }

  /** 부위별 색 칠하기. 목록에 없는 부위는 원래 색(흰색 곱) */
  setPartColors(colors: Partial<Record<BodyPart, THREE.Color>>) {
    for (const [mesh, parts] of this.partOfVertex) {
      const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < parts.length; i++) {
        const c = parts[i] >= 0 ? colors[this.partList[parts[i]]] : undefined;
        arr[i * 3] = c ? c.r : 1;
        arr[i * 3 + 1] = c ? c.g : 1;
        arr[i * 3 + 2] = c ? c.b : 1;
      }
      attr.needsUpdate = true;
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

  /** 서는 자세에서 몸을 낮춘 높이(월드, m) */
  private get stanceDrop(): number {
    return STANCE.dropM * this.scale;
  }

  /** 발끝으로 몸을 들어 올린다(m) — 하이킥. beginFrame이 서는 자세 높이로 되돌린다 */
  setRise(m: number) {
    this.fighter.model.position.y = -this.stanceDrop + m;
    this.fighter.model.updateMatrixWorld(true);
  }

  /**
   * 모든 뼈를 쉬는 자세로 되돌리고 주먹을 쥔 뒤, 서는 자세(왼발 앞·오른발 뒤, 무릎 살짝 굽힘)로 선다.
   * 뼈 크기는 그대로 둔다.
   */
  beginFrame() {
    this.fighter.model.position.y = -this.stanceDrop;
    for (const [bone, q] of this.rest) bone.quaternion.copy(q);
    for (const [bone, q] of this.fist) bone.quaternion.copy(q);
    this.fighter.model.updateMatrixWorld(true);
    this.rotateWorld(this.bone("pelvis"), _v1.set(0, 1, 0), THREE.MathUtils.degToRad(STANCE.hipTwistDeg));
    this.plantFeet();
  }

  /** 서는 자세의 발목 자리 (월드, 바닥 기준 — 몸을 낮추거나 들어도 그대로) */
  stanceAnkle(side: ArmSide, target = new THREE.Vector3()): THREE.Vector3 {
    const lead = side === LEAD_SIDE;
    target.copy(this.restAnkle[side]);
    target.z += lead ? STANCE.stepM : -STANCE.stepM;
    target.x += side === "l" ? -STANCE.inwardM[side] : STANCE.inwardM[side];
    target.applyMatrix4(this.fighter.model.matrixWorld);
    target.y -= this.fighter.model.position.y;
    return target;
  }

  /** 서는 자세의 발끝 방향 (월드). pivotDeg만큼 더 돌린다 (돌려차기 때 디딤발 돌리기) */
  stanceToe(side: ArmSide, pivotDeg = 0, target = new THREE.Vector3()): THREE.Vector3 {
    const yaw = THREE.MathUtils.degToRad(STANCE.toeYawDeg[side] + pivotDeg);
    return target.copy(this.restToe[side]).applyAxisAngle(_v2.set(0, 1, 0), yaw).transformDirection(this.fighter.model.matrixWorld);
  }

  /**
   * 두 발을 서는 자세 자리에 놓는다 (골반을 돌리거나 기울인 뒤 다시 불러 발이 미끄러지지 않게).
   * skip에 든 다리는 건너뛴다 (차는 다리). pivot은 그 발의 발끝을 더 돌린다.
   */
  plantFeet(skip?: ArmSide, pivot?: { side: ArmSide; deg: number }) {
    for (const side of ["l", "r"] as const) {
      if (side === skip) continue;
      const toe = this.stanceToe(side, pivot?.side === side ? pivot.deg : 0);
      // 무릎은 발끝 쪽을 향한다
      const pole = this.hip(side).add(new THREE.Vector3(toe.x, 0, toe.z).normalize());
      this.reachLeg(side, this.stanceAnkle(side), pole, 1, toe);
    }
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
    // 목은 골반의 서는 자세 비틀기까지 함께 되돌려 얼굴이 상대를 보게 한다
    const neck = total + THREE.MathUtils.degToRad(STANCE.hipTwistDeg);
    this.rotateWorld(this.bone("neck_01"), up, -neck * NECK_COUNTER);
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

  /** 이름으로 뼈를 돌려 자식 뼈가 point를 향하게 한다 (관절기 자세용) */
  aimBone(boneName: string, childName: string, point: THREE.Vector3) {
    this.aim(this.bone(boneName), this.bone(childName), point);
  }

  /** 이름으로 뼈를 월드 축 둘레로 돌린다 (관절기 자세용) */
  rotateBone(boneName: string, axis: THREE.Vector3, angleRad: number) {
    this.rotateWorld(this.bone(boneName), axis, angleRad);
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

  // ── 다리·골반·팔꿈치 (PLAN 작업 12) ──

  /**
   * 골반 돌리기(°, +면 오른쪽 엉덩이가 앞으로), 몸통 뒤로 젖히기(°), 골반 옆 기울이기(°, +면 왼쪽 엉덩이가 올라감).
   * setTwist보다 먼저 부른다.
   */
  setHips(twistDeg: number, leanBackDeg: number, rollDeg = 0) {
    const up = new THREE.Vector3(0, 1, 0);
    this.rotateWorld(this.bone("pelvis"), up, THREE.MathUtils.degToRad(twistDeg));
    if (rollDeg !== 0) this.rotateWorld(this.bone("pelvis"), this.forward(), THREE.MathUtils.degToRad(rollDeg));
    // 젖히기: 선수 왼쪽 축으로 돌리면 윗몸이 뒤로 간다 (앞 = +Z, 왼쪽 = +X 기준 오른손 법칙)
    const axis = this.left();
    this.rotateWorld(this.bone("spine_01"), axis, -THREE.MathUtils.degToRad(leanBackDeg));
  }

  /** 엉덩이 관절 위치 (월드) */
  hip(side: ArmSide, target = new THREE.Vector3()): THREE.Vector3 {
    return this.pos(`thigh_${side}`, target);
  }

  /** 다리 길이(월드): 넓적다리, 정강이 */
  legLengths(side: ArmSide) {
    const h = this.pos(`thigh_${side}`);
    const k = this.pos(`calf_${side}`);
    const a = this.pos(`foot_${side}`);
    return { thigh: h.distanceTo(k), shank: k.distanceTo(a) };
  }

  /** 정강이 위 한 점 (무릎에서 frac만큼 발목 쪽) — 돌려차기 끝점 */
  shinPoint(side: ArmSide, frac: number, target = new THREE.Vector3()): THREE.Vector3 {
    const k = this.pos(`calf_${side}`, target);
    return k.lerp(this.pos(`foot_${side}`), frac);
  }

  /** 무릎이 향할 쪽: 서 있을 때는 앞, 돌려차기는 위로 돌아간다 (turn 0~1) */
  kneePole(side: ArmSide, turn = 0): THREE.Vector3 {
    const h = this.hip(side);
    const standing = h.clone().addScaledVector(this.forward(), 1);
    const turned = h.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(this.forward(), 0.3);
    return standing.lerp(turned, turn);
  }

  /**
   * 다리 끝점을 target에 놓는다.
   * - frac < 1: 정강이 위 점(돌려차기) — 발은 정강이를 따라 뻗는다
   * - frac = 1: 발목(앞차기·옆차기) — 발끝은 footDir 쪽
   */
  reachLeg(side: ArmSide, target: THREE.Vector3, pole: THREE.Vector3, frac: number, footDir?: THREE.Vector3): boolean {
    const { thigh, shank } = this.legLengths(side);
    const r = solveTwoBone(this.hip(side), target, thigh, shank * frac, pole);
    this.aim(this.bone(`thigh_${side}`), this.bone(`calf_${side}`), r.joint);
    const dir = r.end.clone().sub(r.joint).normalize();
    const ankle = r.joint.clone().addScaledVector(dir, shank);
    this.aim(this.bone(`calf_${side}`), this.bone(`foot_${side}`), ankle);
    const toe = ankle.clone().add(footDir ? footDir.clone().normalize() : dir);
    this.aim(this.bone(`foot_${side}`), this.bone(`ball_${side}`), toe);
    return r.reached;
  }

  /** 무릎 치기: 넓적다리를 target 쪽으로, 정강이는 뒤아래로 접는다 */
  reachKnee(side: ArmSide, target: THREE.Vector3): boolean {
    const { thigh, shank } = this.legLengths(side);
    const h = this.hip(side);
    const dir = target.clone().sub(h);
    const reached = dir.length() <= thigh * 1.001;
    const knee = h.clone().addScaledVector(dir.normalize(), thigh);
    this.aim(this.bone(`thigh_${side}`), this.bone(`calf_${side}`), knee);
    const fold = new THREE.Vector3(0, -1, 0).addScaledVector(this.forward(), -0.6).normalize();
    this.aim(this.bone(`calf_${side}`), this.bone(`foot_${side}`), knee.clone().addScaledVector(fold, shank));
    return reached;
  }

  /** 팔꿈치 끝(뼈 돌출부)이 관절 가운데에서 위팔 방향으로 튀어나온 길이(m, 기본 체형) — 그림용 */
  static readonly ELBOW_TIP_M = 0.05;

  /** 팔꿈치 끝 위치 (월드) — 팔꿈치 치기에서 상대에 닿는 곳 */
  elbowTip(side: ArmSide, target = new THREE.Vector3()): THREE.Vector3 {
    const s = this.shoulder(side);
    const e = this.pos(`lowerarm_${side}`, target);
    return e.addScaledVector(e.clone().sub(s).normalize(), FighterRig.ELBOW_TIP_M * this.scale);
  }

  /** 팔꿈치 치기: 팔꿈치 끝이 target에 오도록 위팔을 돌리고, 아래팔은 접어 손이 제 귀 옆에 오게 한다 */
  reachElbow(side: ArmSide, target: THREE.Vector3): boolean {
    const upper = this.armLengths(side).upper;
    const reach = upper + FighterRig.ELBOW_TIP_M * this.scale;
    const s = this.shoulder(side);
    const dir = target.clone().sub(s);
    const reached = dir.length() <= reach * 1.001;
    const elbow = s.clone().addScaledVector(dir.normalize(), upper);
    this.aim(this.bone(`upperarm_${side}`), this.bone(`lowerarm_${side}`), elbow);
    const ear = this.pos("head").addScaledVector(this.outward(side), 0.08 * this.scale);
    this.aim(this.bone(`lowerarm_${side}`), this.bone(`hand_${side}`), ear);
    this.aim(this.bone(`hand_${side}`), this.bone(`middle_01_${side}`), ear.clone().addScaledVector(this.forward(), 0.1));
    return reached;
  }

  /** 팔꿈치 관절 위치 (월드) */
  elbowPos(side: ArmSide, target = new THREE.Vector3()): THREE.Vector3 {
    return this.pos(`lowerarm_${side}`, target);
  }

  /** 무릎 관절 위치 (월드) */
  kneePos(side: ArmSide, target = new THREE.Vector3()): THREE.Vector3 {
    return this.pos(`calf_${side}`, target);
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
