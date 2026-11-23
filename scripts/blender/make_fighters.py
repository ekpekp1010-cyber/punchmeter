# PLAN 작업 3 (Design Ref: §4.4 3D 캐릭터 준비) — MPFB2로 남·녀 선수 캐릭터와 뼈대를 만들어 .glb로 내보낸다.
# 실행: blender --background --python scripts/blender/make_fighters.py -- <내보낼 폴더>
#
# - 체형은 MPFB 기본값(평균)에서 성별만 정하고, 마름·무거움·근육형을 모양 변형(morph)으로 함께 넣는다 (작업 9).
#   키·팔 벌린 길이·체형별 몸 부피는 public/models/models.json에 적어 브라우저가 크기·체형을 맞출 때 쓴다.
# - 뼈대는 게임용 "game_engine" (53개 뼈, upperarm_l·lowerarm_l 같은 이름)을 쓴다. 코드로 팔다리를 움직이기 쉽다.
# - 피부는 일반 피부를 쓰고, 여자 선수는 자산 팩의 운동복(크롭 상의 + 레깅스)을 입힌다.
#   (자산 팩에 격투기 반바지가 없다. "special suit" 피부는 온몸을 덮는 무늬 옷이라 쓰지 않는다)
#   남자 선수는 허리~허벅지 가운데 면을 반바지 색 재질로 칠한다 (paint_shorts).
# - 재질은 웹(three.js)에서 그대로 읽히도록 GAMEENGINE(기본 PBR) 방식으로 만든다.
# - 파일 크기를 줄이려고 그림(텍스처)은 긴 변 1024px 이하로 줄인다.
import json
import os
import sys

import bmesh
import bpy

from bl_ext.user_default.mpfb.services import (
    ExportService,
    HumanService,
    LocationService,
    TargetService,
)

OUT_DIR = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
DATA = LocationService.get_user_data()
MAX_TEXTURE_PX = 1024

FIGHTERS = {
    # 이름: (gender 값 1=남 0=여, 피부, 입힐 옷 목록, 반바지 색 RGB 또는 None)
    "fighter_male": (1.0, "young_caucasian_male", [], (0.55, 0.06, 0.08)),
    "fighter_female": (0.0, "young_caucasian_female", ["female_sportsuit01"], None),
}

# 반바지 범위 (그림용 모양 값, 계산에 쓰지 않음)
# 위쪽 = 골반 뼈와 spine_01 뼈 사이에서 이 비율만큼 위, 아래쪽 = 허벅지 뼈 길이의 이 비율만큼 내려온 곳
SHORTS_TOP_RATIO = 1.0
SHORTS_BOTTOM_RATIO = 0.45
# 반바지로 칠할 수 있는 뼈 (이 뼈의 영향이 가장 큰 면만 칠한다 → 옆에 내린 손·팔은 칠하지 않음)
SHORTS_BONES = {"pelvis", "spine_01", "thigh_l", "thigh_r"}

# 체형 변형 (PLAN 작업 9). MPFB의 weight·muscle 값(0~1)으로 캐릭터를 따로 만들어 기본 체형과의 차이를
# 모양 변형(morph)으로 넣는다. 브라우저는 입력 체중에 맞춰 이 변형을 섞는다 (lib/motion/bodyShape.ts).
#   base: 기본(평균) / light: 가장 마름 / heavy: 가장 무거움 / muscular: 근육 최대
BODY_VARIANTS = {
    "base": (0.5, 0.5),
    "light": (0.0, 0.5),
    "heavy": (1.0, 0.5),
    "muscular": (0.5, 1.0),
}

# 눈·눈썹·속눈썹 (자산 팩의 CC0 자료)
EXTRAS = [
    ("eyes/high-poly/high-poly.mhclo", "Eyes"),
    ("eyebrows/eyebrow001/eyebrow001.mhclo", "Eyebrows"),
    ("eyelashes/eyelashes01/eyelashes01.mhclo", "Eyelashes"),
]


def data_path(*parts: str) -> str:
    path = os.path.join(DATA, *parts)
    if not os.path.exists(path):
        raise FileNotFoundError(f"자산 파일이 없습니다: {path}")
    return path


def fix_materials_for_web() -> None:
    """
    MPFB 재질은 모두 반투명(BLEND)·양면으로 내보내져, 웹에서 그리는 순서가 꼬여 입 안이 얼굴 밖으로 비쳐 보인다.
    - 몸·옷·눈: 투명도 연결을 끊어 불투명(OPAQUE), 뒷면은 그리지 않음
    - 눈썹·속눈썹: 투명도를 0.5 기준으로 잘라 MASK (glTF 내보내기는 "Greater Than" 노드를 MASK로 읽는다)
    """
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        alpha_in = bsdf.inputs["Alpha"]
        links = mat.node_tree.links
        hair_like = any(k in mat.name.lower() for k in ("eyebrow", "eyelash"))
        if hair_like and alpha_in.is_linked:
            source = alpha_in.links[0].from_socket
            links.remove(alpha_in.links[0])
            cut = mat.node_tree.nodes.new("ShaderNodeMath")
            cut.operation = "GREATER_THAN"
            cut.inputs[1].default_value = 0.5
            links.new(source, cut.inputs[0])
            links.new(cut.outputs[0], alpha_in)
            mat.use_backface_culling = False
        else:
            for link in list(alpha_in.links):
                links.remove(link)
            alpha_in.default_value = 1.0
            mat.use_backface_culling = True
        mat.surface_render_method = "DITHERED"


def paint_shorts(basemesh, rig, rgb: tuple[float, float, float]) -> int:
    """
    몸 메시의 허리~허벅지 가운데 면을 반바지 재질로 바꾼다 (옷 메시를 따로 만들지 않고 몸에 칠하는 방식).
    면의 높이와 그 면에 가장 크게 영향을 주는 뼈로 고른다. 칠한 면 수를 돌려준다.
    """
    bones = rig.data.bones
    to_world = rig.matrix_world

    def head_z(bone_name: str) -> float:
        return (to_world @ bones[bone_name].head_local).z

    pelvis_z, spine_z = head_z("pelvis"), head_z("spine_01")
    thigh_top = head_z("thigh_l")
    thigh_len = thigh_top - head_z("calf_l")
    top = pelvis_z + (spine_z - pelvis_z) * SHORTS_TOP_RATIO
    bottom = thigh_top - thigh_len * SHORTS_BOTTOM_RATIO

    mesh = basemesh.data
    group_names = {g.index: g.name for g in basemesh.vertex_groups}

    def main_bone(vertex) -> str | None:
        best = max(
            (g for g in vertex.groups if group_names.get(g.group) in bones),
            key=lambda g: g.weight,
            default=None,
        )
        return group_names[best.group] if best else None

    vertex_ok = [
        bottom <= (basemesh.matrix_world @ v.co).z <= top and main_bone(v) in SHORTS_BONES for v in mesh.vertices
    ]

    shorts = bpy.data.materials.new(f"{basemesh.name}.shorts")
    shorts.use_nodes = True
    bsdf = next(n for n in shorts.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.75
    shorts.use_backface_culling = True
    mesh.materials.append(shorts)
    index = len(mesh.materials) - 1

    # 꼭짓점 절반 이상이 범위 안이면 칠한다 (모두 요구하면 허리선이 계단처럼 파인다)
    painted = 0
    for poly in mesh.polygons:
        if sum(vertex_ok[i] for i in poly.vertices) * 2 >= len(poly.vertices):
            poly.material_index = index
            painted += 1
    return painted


def build_character(name: str, gender: float, skin: str, clothes: list[str], weight: float, muscle: float,
                    with_rig: bool = True):
    """빈 장면에 캐릭터 하나를 만들고(체형 굳히기·도우미 지우기까지) (몸 메시, 뼈대, 메시 목록)을 돌려준다"""
    bpy.ops.wm.read_homefile(use_empty=True)

    macro = TargetService.get_default_macro_info_dict()
    macro["gender"] = gender
    macro["weight"] = weight
    macro["muscle"] = muscle
    basemesh = HumanService.create_human(scale=0.1, macro_detail_dict=macro)  # 0.1 → 미터 단위
    basemesh.name = name

    rig = HumanService.add_builtin_rig(basemesh, "game_engine") if with_rig else None
    HumanService.set_character_skin(data_path("skins", skin, f"{skin}.mhmat"), basemesh, skin_type="GAMEENGINE")
    for rel, asset_type in EXTRAS:
        HumanService.add_mhclo_asset(
            data_path(*rel.split("/")), basemesh, asset_type=asset_type, subdiv_levels=0, material_type="GAMEENGINE"
        )
    for cloth in clothes:
        HumanService.add_mhclo_asset(
            data_path("clothes", cloth, f"{cloth}.mhclo"), basemesh, asset_type="Clothes", subdiv_levels=0,
            material_type="GAMEENGINE",
        )

    # 체형 값을 메시에 굳히고(shape key → 실제 모양), 숨긴 도우미 메시를 지운다
    TargetService.bake_targets(basemesh)
    ExportService.bake_modifiers_remove_helpers(basemesh, bake_masks=True, remove_helpers=True, also_proxy=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for obj in meshes:
        for modifier in list(obj.modifiers):
            if modifier.type in {"SUBSURF", "MASK"}:
                obj.modifiers.remove(modifier)
    return basemesh, rig, meshes


def mesh_role(obj, basemesh) -> str:
    """메시의 역할 이름 (몸 = body, 나머지는 자산 이름). 체형별로 만든 캐릭터끼리 같은 메시를 짝짓는 데 쓴다"""
    if obj == basemesh:
        return "body"
    return obj.name.split(".")[-1]


def mesh_coords(meshes, basemesh) -> dict[str, list[tuple[float, float, float]]]:
    return {mesh_role(o, basemesh): [tuple(v.co) for v in o.data.vertices] for o in meshes}


def body_volume_l(basemesh) -> float:
    """몸 메시의 부피(L). 눈·입 구멍 때문에 아주 조금 어긋날 수 있다"""
    bm = bmesh.new()
    bm.from_mesh(basemesh.data)
    bm.transform(basemesh.matrix_world)
    volume = bm.calc_volume(signed=False)
    bm.free()
    return volume * 1000


def arm_length_m(rig) -> float:
    """한쪽 팔 길이(m) = 위팔 + 아래팔 + 손목에서 가운뎃손가락 끝까지"""
    bones = rig.data.bones
    w = rig.matrix_world
    shoulder = w @ bones["upperarm_l"].head_local
    elbow = w @ bones["lowerarm_l"].head_local
    wrist = w @ bones["hand_l"].head_local
    fingertip = w @ bones["middle_03_l"].tail_local
    return (elbow - shoulder).length + (wrist - elbow).length + (fingertip - wrist).length


def arm_span_m(rig) -> float:
    """양팔을 옆으로 펼쳤을 때 길이(m) = 두 어깨 사이 + 2 × (위팔 + 아래팔 + 손 끝까지)"""
    bones = rig.data.bones
    w = rig.matrix_world

    def head(n):
        return w @ bones[n].head_local

    def tail(n):
        return w @ bones[n].tail_local

    shoulders = (head("upperarm_l") - head("upperarm_r")).length
    arm = (head("lowerarm_l") - head("upperarm_l")).length + (head("hand_l") - head("lowerarm_l")).length
    hand = (tail("middle_03_l") - head("hand_l")).length
    return shoulders + 2 * (arm + hand)


def make_fighter(name: str, gender: float, skin: str, clothes: list[str], shorts_rgb) -> dict:
    # 1) 체형 변형용 캐릭터들을 먼저 만들어 메시 점 위치와 몸 부피를 모은다
    coords: dict[str, dict[str, list]] = {}
    volumes: dict[str, float] = {}
    for key, (weight, muscle) in BODY_VARIANTS.items():
        if key != "base":
            base_mesh, _, meshes = build_character(name, gender, skin, clothes, weight, muscle, with_rig=False)
            coords[key] = mesh_coords(meshes, base_mesh)
        # 부피는 옷 없이 잰다 (옷 아래 몸은 지워져 구멍이 생기므로)
        naked, _, _ = build_character(name, gender, skin, [], weight, muscle, with_rig=False)
        volumes[key] = body_volume_l(naked)

    # 2) 기본 체형 캐릭터를 만들고, 변형용 점 위치를 모양 변형(shape key)으로 넣는다
    weight, muscle = BODY_VARIANTS["base"]
    basemesh, rig, meshes = build_character(name, gender, skin, clothes, weight, muscle)
    for obj in meshes:
        role = mesh_role(obj, basemesh)
        obj.shape_key_add(name="Basis", from_mix=False)
        for key, per_role in coords.items():
            points = per_role.get(role)
            if points is None or len(points) != len(obj.data.vertices):
                print(f"[경고] {name}/{role}: {key} 체형의 점 개수가 달라 모양 변형을 건너뜀")
                continue
            sk = obj.shape_key_add(name=key, from_mix=False)
            for i, co in enumerate(points):
                sk.data[i].co = co

    fix_materials_for_web()
    if shorts_rgb is not None:
        print(f"[반바지] {name}: 면 {paint_shorts(basemesh, rig, shorts_rgb)}개 칠함")

    # 그림 크기 줄이기
    for image in bpy.data.images:
        w, h = image.size
        if max(w, h) > MAX_TEXTURE_PX:
            k = MAX_TEXTURE_PX / max(w, h)
            image.scale(max(1, round(w * k)), max(1, round(h * k)))

    # 뼈대와 그 자식 메시만 골라 .glb로 내보낸다
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig

    out = os.path.join(OUT_DIR, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_skins=True,
        export_animations=False,
        export_morph=True,
        export_morph_normal=True,
        export_apply=True,
        export_yup=True,
    )

    # 확인용 숫자 출력과 치수 기록
    zs = [(basemesh.matrix_world @ v.co).z for v in basemesh.data.vertices]
    height = max(zs) - min(zs)
    span = arm_span_m(rig)
    print(
        f"[완료] {name}: 키 {height:.3f} m, 팔 벌린 길이 {span:.3f} m, 부피 {volumes}, 뼈 {len(rig.data.bones)}개, "
        f"메시 {len(meshes)}개, 파일 {os.path.getsize(out) / 1e6:.1f} MB"
    )
    return {
        "file": f"/models/{name}.glb",
        "heightM": round(height, 4),
        "armSpanM": round(span, 4),
        "armLengthM": round(arm_length_m(rig), 4),
        "volumeL": {k: round(v, 3) for k, v in volumes.items()},
        "morphs": [k for k in BODY_VARIANTS if k != "base"],
    }


os.makedirs(OUT_DIR, exist_ok=True)
info = {}
for fighter_name, (gender_value, skin_name, cloth_names, shorts_color) in FIGHTERS.items():
    info[fighter_name] = make_fighter(fighter_name, gender_value, skin_name, cloth_names, shorts_color)
with open(os.path.join(OUT_DIR, "models.json"), "w", encoding="utf-8") as fp:
    json.dump(info, fp, ensure_ascii=False, indent=2)
print("[완료] models.json")
