# PLAN 작업 3 (Design Ref: §4.4 3D 캐릭터 준비) — MPFB2로 남·녀 선수 캐릭터와 뼈대를 만들어 .glb로 내보낸다.
# 실행: blender --background --python scripts/blender/make_fighters.py -- <내보낼 폴더>
#
# - 체형은 MPFB 기본값(평균)에서 성별만 정한다. 입력한 키·체중에 맞추는 일은 PLAN 작업 9(체형)에서 한다.
# - 뼈대는 게임용 "game_engine" (53개 뼈, upperarm_l·lowerarm_l 같은 이름)을 쓴다. 코드로 팔다리를 움직이기 쉽다.
# - 피부는 일반 피부를 쓰고, 여자 선수는 자산 팩의 운동복(크롭 상의 + 레깅스)을 입힌다.
#   (자산 팩에 격투기 반바지가 없다. "special suit" 피부는 온몸을 덮는 무늬 옷이라 쓰지 않는다)
# - 재질은 웹(three.js)에서 그대로 읽히도록 GAMEENGINE(기본 PBR) 방식으로 만든다.
# - 파일 크기를 줄이려고 그림(텍스처)은 긴 변 1024px 이하로 줄인다.
import os
import sys

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
    # 이름: (gender 값 1=남 0=여, 피부, 입힐 옷 목록)
    "fighter_male": (1.0, "young_caucasian_male", []),
    "fighter_female": (0.0, "young_caucasian_female", ["female_sportsuit01"]),
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


def make_fighter(name: str, gender: float, skin: str, clothes: list[str]) -> None:
    # 빈 장면에서 시작한다
    bpy.ops.wm.read_homefile(use_empty=True)

    macro = TargetService.get_default_macro_info_dict()
    macro["gender"] = gender
    basemesh = HumanService.create_human(scale=0.1, macro_detail_dict=macro)  # 0.1 → 미터 단위
    basemesh.name = name

    rig = HumanService.add_builtin_rig(basemesh, "game_engine")
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

    fix_materials_for_web()

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
        export_morph=False,
        export_apply=True,
        export_yup=True,
    )

    # 확인용 숫자 출력
    zs = [(basemesh.matrix_world @ v.co).z for v in basemesh.data.vertices]
    print(
        f"[완료] {name}: 키 {max(zs) - min(zs):.3f} m, 뼈 {len(rig.data.bones)}개, "
        f"몸 정점 {len(basemesh.data.vertices)}개, 메시 {len(meshes)}개, 파일 {os.path.getsize(out) / 1e6:.1f} MB"
    )


os.makedirs(OUT_DIR, exist_ok=True)
for fighter_name, (gender_value, skin_name, cloth_names) in FIGHTERS.items():
    make_fighter(fighter_name, gender_value, skin_name, cloth_names)
