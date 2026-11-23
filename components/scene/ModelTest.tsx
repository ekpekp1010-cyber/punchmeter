"use client";
// PLAN 작업 3: 3D 캐릭터 시험 화면 — MPFB2로 만든 남·녀 캐릭터(.glb)를 띄우고 코드로 오른팔(팔꿈치)을 굽혀 본다.
// Design Ref: §4.5 동작 만드는 법 — 뼈를 코드로 돌려 동작을 만든다. 이 시험은 "뼈 하나를 원하는 각도로 돌릴 수 있는가"를 확인한다.
// 실제 실험실 무대는 PLAN 작업 8(3D 무대)에서 따로 만든다.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** 굽힐 뼈 (MPFB2 game_engine 뼈대의 오른쪽 아래팔) */
const ELBOW_BONE = "lowerarm_r";
const HAND_BONE = "hand_r";

interface ElbowRig {
  bone: THREE.Bone;
  /** 팔을 펴고 있을 때의 월드 회전 */
  restWorld: THREE.Quaternion;
  /** 팔꿈치가 굽는 축 (월드 기준) */
  axis: THREE.Vector3;
}

/** 아래팔이 몸 앞쪽으로 굽도록 축을 정한다: 축 = 아래팔 방향 × 캐릭터 앞쪽 */
function makeElbowRig(model: THREE.Object3D): ElbowRig | null {
  const bone = model.getObjectByName(ELBOW_BONE) as THREE.Bone | undefined;
  const hand = model.getObjectByName(HAND_BONE);
  if (!bone || !hand) return null;
  model.updateMatrixWorld(true);
  const elbowPos = bone.getWorldPosition(new THREE.Vector3());
  const handPos = hand.getWorldPosition(new THREE.Vector3());
  const forearm = handPos.sub(elbowPos).normalize();
  // glTF 캐릭터는 +Z를 바라본다. 모델을 돌려 세웠으면 그만큼 돌린 방향이 앞쪽이다
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
  const axis = new THREE.Vector3().crossVectors(forearm, forward).normalize();
  return { bone, restWorld: bone.getWorldQuaternion(new THREE.Quaternion()), axis };
}

/** 팔꿈치를 angleDeg만큼 굽힌다 (0 = 편 팔) */
function bendElbow(rig: ElbowRig, angleDeg: number) {
  const bend = new THREE.Quaternion().setFromAxisAngle(rig.axis, THREE.MathUtils.degToRad(angleDeg));
  const targetWorld = bend.multiply(rig.restWorld);
  const parentWorld = rig.bone.parent!.getWorldQuaternion(new THREE.Quaternion());
  rig.bone.quaternion.copy(parentWorld.invert().multiply(targetWorld));
}

export default function ModelTest() {
  const mountRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const autoRef = useRef(false);
  const [angle, setAngle] = useState(0);
  const [auto, setAuto] = useState(false);
  const [status, setStatus] = useState("캐릭터 불러오는 중…");
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1f2430);
    const camera = new THREE.PerspectiveCamera(35, mount.clientWidth / mount.clientHeight, 0.1, 50);
    camera.position.set(0, 1.4, 4.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x3a4150 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const rigs: ElbowRig[] = [];
    const loader = new GLTFLoader();
    const place = [
      { file: "/models/fighter_male.glb", x: -0.55, turn: Math.PI / 2 }, // 오른쪽(+X)을 바라봄
      { file: "/models/fighter_female.glb", x: 0.55, turn: -Math.PI / 2 }, // 왼쪽(-X)을 바라봄
    ];
    let disposed = false;
    Promise.all(place.map((p) => loader.loadAsync(p.file)))
      .then((gltfs) => {
        if (disposed) return;
        gltfs.forEach((gltf, i) => {
          const model = gltf.scene;
          model.position.x = place[i].x;
          model.rotation.y = place[i].turn;
          scene.add(model);
          const rig = makeElbowRig(model);
          if (rig) rigs.push(rig);
        });
        setStatus(rigs.length === 2 ? "불러오기 완료: 두 캐릭터 모두 팔꿈치 뼈를 찾았어요" : "팔꿈치 뼈를 찾지 못한 캐릭터가 있어요");
      })
      .catch((err: unknown) => setStatus(`불러오기 실패: ${String(err)}`));

    let frames = 0;
    let fpsStart = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (autoRef.current) {
        // 1초에 한 번 굽혔다 펴기 (0~140°)
        angleRef.current = 70 - 70 * Math.cos((now / 1000) * Math.PI * 2);
      }
      for (const rig of rigs) bendElbow(rig, angleRef.current);
      controls.update();
      renderer.render(scene, camera);
      frames++;
      if (now - fpsStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsStart)));
        if (autoRef.current) setAngle(Math.round(angleRef.current));
        frames = 0;
        fpsStart = now;
      }
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col gap-3 bg-zinc-900 p-4 text-zinc-100">
      <h1 className="text-lg font-semibold">3D 캐릭터 시험 (PLAN 작업 3)</h1>
      <p className="text-sm text-zinc-400">
        MPFB2(CC0)로 만든 남·녀 캐릭터입니다. 끌어서 시점을 돌리고, 휠로 확대합니다. 오른팔 팔꿈치를 코드로 굽힙니다.
      </p>
      <div ref={mountRef} className="h-[70vh] w-full overflow-hidden rounded-lg" />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          팔꿈치 굽힘 {angle}°
          <input
            type="range"
            min={0}
            max={140}
            value={angle}
            disabled={auto}
            onChange={(e) => {
              const v = Number(e.target.value);
              angleRef.current = v;
              setAngle(v);
            }}
          />
        </label>
        <button
          className="rounded bg-zinc-700 px-3 py-1 hover:bg-zinc-600"
          onClick={() => {
            autoRef.current = !auto;
            setAuto(!auto);
          }}
        >
          {auto ? "자동 멈춤" : "자동으로 굽혔다 펴기"}
        </button>
        <span>초당 화면 수: {fps} fps</span>
        <span className="text-zinc-400">{status}</span>
      </div>
    </div>
  );
}
