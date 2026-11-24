// 근육 갈라짐 새기기 (2026-11-24 사용자 요청: "선명한 근육, 근육의 갈라짐")
//
// MakeHuman(MPFB) 캐릭터는 근육을 최대로 해도 복근·가슴 아래선 같은 근육 사이 골이 거의 없다.
// 그래서 몸 피부 재질에 "근육 사이 골" 모양을 화면 점(픽셀)마다 계산해 새긴다:
//   - 골의 높낮이로 빛 받는 방향(법선)을 살짝 꺾어(범프) 골 양쪽이 밝고 어둡게 갈리고,
//   - 골 바닥은 조금 어둡게 칠한다.
// 위치는 쉬는 자세(움직이기 전) 몸 좌표로 정하므로, 팔다리를 움직여도 골이 피부에 붙어 따라간다.
// 체형 변형(덩치·마름)도 먼저 반영된 뒤의 좌표를 쓴다.
//
// 새기는 골 (해부학 그림을 참고한 그림용 위치·깊이, 계산에는 쓰지 않음):
//   복근: 가운데 세로선(백선), 가로선 3줄(나눔힘줄), 양옆 바깥 선(반달선) → 식스팩
//   가슴(남자): 가슴 아래선, 가운데 가슴뼈 선, 어깨와 가슴 사이 선
//   옆구리: 톱니근 사선 3줄
//   등: 가운데 척추 골
//   팔: 어깨(삼각근) 아래 V자 선, 위팔 바깥 세로선(이두·삼두 사이)
//   다리: 허벅지 앞 세로선 2줄과 무릎 위 선(대퇴사두), 종아리 가운데 선과 아래 V자 선, 정강이 옆 선

import * as THREE from "three";
import type { ModelInfo } from "@/lib/motion/bodyShape";
import type { Sex } from "@/lib/types";

/** 골 깊이(m)와 골 바닥을 어둡게 하는 정도 — 그림용 */
export const MUSCLE_DETAIL = { depthM: 0.0035, darken: 0.2 };

/** 캐릭터별 몸 기준 위치 (쉬는 자세 메시 좌표, m) */
interface Landmarks {
  navelY: number;
  solarY: number;
  /** 좌우 폭 배율 (남자 기본 = 1) */
  scaleX: number;
  /** 가슴 골을 새길지 (여자는 운동복이 가슴을 덮어서 0) */
  pec: number;
  /** 왼쪽 관절 위치 (쉬는 자세). 오른쪽은 좌우 거울로 같이 쓴다 */
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  hip: THREE.Vector3;
  knee: THREE.Vector3;
  ankle: THREE.Vector3;
}

/** 남자 기본 캐릭터의 옆구리(갈비) 위치 x — 폭 배율의 기준 */
const MALE_RIBS_X = 0.138;

/** 뼈의 쉬는 자세 위치 (메시 좌표). 뼈대의 묶을 때 행렬(boneInverses)에서 구한다 */
function bindPosition(mesh: THREE.SkinnedMesh, boneName: string): THREE.Vector3 {
  const i = mesh.skeleton.bones.findIndex((b) => b.name === boneName);
  if (i < 0) throw new Error(`뼈가 없습니다: ${boneName}`);
  const m = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert();
  const v = new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(mesh.bindMatrixInverse);
  v.x = Math.abs(v.x); // 왼쪽 기준 (거울로 오른쪽도 씀)
  return v;
}

/**
 * models.json의 부위 위치와 뼈대로 기준 위치를 정한다
 * (배꼽 ≈ 배 부위보다 1cm 위, 명치 = 명치 부위, 관절 = 왼쪽 팔·다리 뼈 시작점)
 */
export function landmarksOf(mesh: THREE.SkinnedMesh, info: ModelInfo, sex: Sex): Landmarks {
  return {
    navelY: info.anchors.abdomen.pos[1] + 0.01,
    solarY: info.anchors.solarPlexus.pos[1],
    scaleX: info.anchors.ribsLeft.pos[0] / MALE_RIBS_X,
    pec: sex === "male" ? 1 : 0,
    shoulder: bindPosition(mesh, "upperarm_l"),
    elbow: bindPosition(mesh, "lowerarm_l"),
    hip: bindPosition(mesh, "thigh_l"),
    knee: bindPosition(mesh, "calf_l"),
    ankle: bindPosition(mesh, "foot_l"),
  };
}

const VERTEX_DECL = /* glsl */ `
varying vec3 vMuscleRest;
varying vec3 vMuscleRestN;
`;

const FRAGMENT_DECL = /* glsl */ `
varying vec3 vMuscleRest;
varying vec3 vMuscleRestN;
uniform float uNavelY;
uniform float uSolarY;
uniform float uScaleX;
uniform float uPec;
uniform float uMuscleDepth;
uniform float uMuscleDarken;
uniform vec3 uShoulder;
uniform vec3 uElbow;
uniform vec3 uHip;
uniform vec3 uKnee;
uniform vec3 uAnkle;

// 골 하나: 선까지 거리 d, 폭 w → 0~1
float mGroove(float d, float w) { return exp(-(d * d) / (w * w)); }
// lo~hi 구간 안에서 1, 바깥으로 부드럽게 0
float mBand(float v, float lo, float hi, float soft) {
  return smoothstep(lo - soft, lo + soft, v) * (1.0 - smoothstep(hi - soft, hi + soft, v));
}

// 팔다리 좌표: 뼈 a→b 위에서 t(0~1), 둘레 각 th(기준 방향 ref = 0, 라디안), 반지름 r, 길이 L
vec4 mLimb(vec3 p, vec3 a, vec3 b, vec3 ref) {
  vec3 axis = b - a;
  float L = length(axis);
  axis /= L;
  vec3 d = p - a;
  float t = dot(d, axis) / L;
  vec3 r = d - axis * (t * L);
  vec3 e1 = normalize(ref - axis * dot(ref, axis));
  vec3 e2 = cross(axis, e1);
  return vec4(t, atan(dot(r, e2), dot(r, e1)), length(r), L);
}

// 팔·다리 근육 골 (좌우 거울: p.x는 절댓값)
float limbGrooves(vec3 p) {
  float g = 0.0;
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float pi2 = 1.5707963;

  // 위팔 (어깨→팔꿈치, 각 0 = 바깥쪽). 몸통 쪽 점은 반지름으로 거른다
  vec4 ua = mLimb(q, uShoulder, uElbow, vec3(1.0, 0.0, 0.0));
  float onArm = (1.0 - smoothstep(0.055, 0.075, ua.z)) * mBand(ua.x, 0.02, 1.0, 0.04);
  float adeg = abs(ua.y);
  // 삼각근 아래 V자: 바깥 가운데가 가장 낮고(t 0.47) 앞뒤로 갈수록 올라간다
  float tDel = 0.47 - 0.3 * min(adeg / pi2, 1.0);
  g += 0.8 * mGroove((ua.x - tDel) * ua.w, 0.009) * onArm * (1.0 - smoothstep(1.7, 2.1, adeg));
  // 위팔 바깥 세로선 (이두·삼두 사이)
  g += 0.55 * mGroove(ua.y * ua.z, 0.006) * onArm * mBand(ua.x, 0.5, 0.9, 0.05);

  // 허벅지 (엉덩이→무릎, 각 0 = 앞). 반바지 아래만 보인다
  vec4 th = mLimb(q, uHip, uKnee, vec3(0.0, 0.0, 1.0));
  float onThigh = (1.0 - smoothstep(0.085, 0.11, th.z)) * mBand(th.x, 0.3, 1.0, 0.04);
  g += 0.6 * mGroove((abs(th.y) - 0.55) * th.z, 0.008) * onThigh * mBand(th.x, 0.35, 0.86, 0.05);
  // 무릎 위 선 (가운데가 조금 낮다)
  float tKnee = 0.86 + 0.05 * min(abs(th.y), 1.2);
  g += 0.6 * mGroove((th.x - tKnee) * th.w, 0.01) * onThigh * (1.0 - smoothstep(1.0, 1.4, abs(th.y)));

  // 종아리·정강이 (무릎→발목, 각 0 = 뒤)
  vec4 cf = mLimb(q, uKnee, uAnkle, vec3(0.0, 0.0, -1.0));
  float onCalf = (1.0 - smoothstep(0.07, 0.09, cf.z)) * mBand(cf.x, 0.04, 0.95, 0.04);
  float cdeg = abs(cf.y);
  // 종아리 두 갈래 사이 세로선
  g += 0.55 * mGroove(cf.y * cf.z, 0.007) * onCalf * mBand(cf.x, 0.08, 0.42, 0.05);
  // 종아리 아래 V자 (아킬레스 힘줄 위)
  float tGas = 0.47 + 0.08 * min(cdeg / 1.2, 1.0);
  g += 0.7 * mGroove((cf.x - tGas) * cf.w, 0.012) * onCalf * (1.0 - smoothstep(1.2, 1.6, cdeg));
  // 정강이뼈 옆 선 (앞쪽 근육 가장자리)
  g += 0.45 * mGroove((cdeg - (3.1416 - 0.5)) * cf.z, 0.006) * onCalf * mBand(cf.x, 0.1, 0.7, 0.05);
  return g;
}

// 골의 깊이 합 (0 = 평평, 1 = 가장 깊은 골)
float muscleGrooves(vec3 p, vec3 n) {
  float sx = uScaleX;
  float ax = abs(p.x) / sx;           // 좌우 대칭, 남자 폭 기준으로 맞춤
  float y = p.y;
  float front = smoothstep(0.25, 0.65, n.z);
  float side = smoothstep(0.35, 0.75, abs(n.x)) * smoothstep(-0.3, 0.2, n.z);
  float back = smoothstep(0.35, 0.7, -n.z);
  float seg = uSolarY - uNavelY;      // 배꼽~명치 길이 (남자 약 0.10 m)
  float absTop = uSolarY + seg * 0.62;
  float absBot = uNavelY - seg * 0.75;
  float g = 0.0;

  // 복근 바깥 선(반달선): 아래는 좁고 위로 갈수록 넓어진다
  float halfW = mix(0.048, 0.088, smoothstep(absBot, absTop, y));
  float inAbs = mBand(y, absBot, absTop, 0.012) * front;
  g += 0.8 * mGroove(ax - halfW, 0.012) * inAbs;
  // 가운데 세로선(백선)
  g += 0.8 * mGroove(ax, 0.009) * inAbs;
  // 가로선 3줄 (배꼽 높이, 가운데, 명치 높이). 바깥으로 갈수록 살짝 내려간다
  float across = 1.0 - smoothstep(halfW - 0.012, halfW + 0.004, ax);
  for (int k = 0; k < 3; k++) {
    float yk = uNavelY + seg * (0.04 + 0.5 * float(k)) - 0.012 * (ax / halfW);
    g += 0.6 * mGroove(y - yk, 0.009) * across * front * step(absBot, y);
  }

  // 가슴(남자): 아래선은 가운데에서 겨드랑이 쪽으로 올라간다
  float pecY = uSolarY + seg * 0.85 + 0.07 * smoothstep(0.09, 0.17, ax);
  float pecSpan = 1.0 - smoothstep(0.15, 0.19, ax);
  g += uPec * 1.0 * mGroove(y - pecY, 0.013) * pecSpan * smoothstep(0.1, 0.5, n.z);
  // 가슴뼈 선 (두 가슴 사이)
  g += uPec * 0.6 * mGroove(ax, 0.011) * mBand(y, pecY, pecY + seg * 1.3, 0.015) * front;
  // 어깨(삼각근)와 가슴 사이: 쇄골 바깥에서 겨드랑이 앞쪽으로
  vec2 dpA = vec2(0.115, pecY + seg * 1.55);
  vec2 dpB = vec2(0.175, pecY + seg * 0.55);
  vec2 q = vec2(ax, y) - dpA;
  vec2 dir = dpB - dpA;
  float tq = clamp(dot(q, dir) / dot(dir, dir), 0.0, 1.0);
  g += uPec * 0.6 * mGroove(length(q - dir * tq), 0.012) * smoothstep(0.0, 0.4, n.z);

  // 옆구리 톱니근: 앞아래로 기운 짧은 사선 3줄
  for (int k = 0; k < 3; k++) {
    float y0 = uSolarY + seg * (0.55 - 0.42 * float(k));
    float d = (y - y0) - 0.55 * (abs(p.z) - 0.02);
    g += 0.45 * mGroove(d, 0.009) * side * mBand(ax, 0.11, 0.17, 0.01) * mBand(p.z, -0.02, 0.09, 0.02);
  }

  // 등 가운데 척추 골
  g += 0.6 * mGroove(ax, 0.012) * back * mBand(y, uNavelY - seg * 0.6, uSolarY + seg * 2.6, 0.03);

  g += limbGrooves(p);
  return min(g, 1.2);
}

// 높이 변화로 법선을 꺾는다 (Mikkelsen의 범프 매핑, three.js perturbNormalArb와 같은 식에서 크기를 맞춤)
vec3 musclePerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/**
 * 몸 피부 재질에 근육 골을 새기는 셰이더를 붙인다. 같은 재질에 두 번 붙이지 않는다.
 * 기준 위치는 캐릭터(성별)마다 다르다.
 */
export function applyMuscleDetail(material: THREE.MeshStandardMaterial, lm: Landmarks) {
  if (material.userData.muscleDetail) return;
  const joints = { uShoulder: lm.shoulder, uElbow: lm.elbow, uHip: lm.hip, uKnee: lm.knee, uAnkle: lm.ankle };
  material.userData.muscleDetail = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNavelY = { value: lm.navelY };
    shader.uniforms.uSolarY = { value: lm.solarY };
    shader.uniforms.uScaleX = { value: lm.scaleX };
    shader.uniforms.uPec = { value: lm.pec };
    shader.uniforms.uMuscleDepth = { value: MUSCLE_DETAIL.depthM };
    shader.uniforms.uMuscleDarken = { value: MUSCLE_DETAIL.darken };
    for (const [name, v] of Object.entries(joints)) shader.uniforms[name] = { value: v };
    shader.vertexShader = (VERTEX_DECL + shader.vertexShader)
      .replace("#include <morphnormal_vertex>", "#include <morphnormal_vertex>\n  vMuscleRestN = objectNormal;")
      .replace("#include <morphtarget_vertex>", "#include <morphtarget_vertex>\n  vMuscleRest = transformed;");
    shader.fragmentShader = (FRAGMENT_DECL + shader.fragmentShader)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  float mG = muscleGrooves(vMuscleRest, normalize(vMuscleRestN));
  float mH = -mG * uMuscleDepth;
  vec2 mdH = vec2(dFdx(mH), dFdy(mH));
  diffuseColor.rgb *= 1.0 - uMuscleDarken * clamp(mG, 0.0, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        "#include <normal_fragment_maps>\n  normal = musclePerturb(-vViewPosition, normal, mdH, faceDirection);",
      );
  };
  // 셰이더 코드가 같으면 같은 프로그램을 나눠 쓴다 (기준 위치는 재질마다 다른 uniform 값)
  material.customProgramCacheKey = () => "muscleDetail-v2";
  material.needsUpdate = true;
}
