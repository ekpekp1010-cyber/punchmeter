# PLAN 작업 3: MPFB2에 자산 팩(zip)을 넣는다. Blender 화면의 "load pack from zip file"과 같은 일을 한다.
# 실행: blender --background --python scripts/blender/install_assets.py -- <자산 팩 zip 경로>
import sys
import zipfile

from bl_ext.user_default.mpfb.services import AssetService, LocationService

zip_path = sys.argv[sys.argv.index("--") + 1]

# 1) zip 모양이 MPFB 자산 팩 규칙에 맞는지 먼저 검사한다 (문제가 없으면 None)
problem = AssetService.check_asset_pack_zip(zip_path)
if problem is not None:
    raise SystemExit(f"자산 팩 검사 실패: {problem}")

# 2) MPFB 사용자 데이터 폴더에 풀고 자산 목록을 새로 읽는다
data_dir = LocationService.get_user_data()
with zipfile.ZipFile(zip_path, "r") as zf:
    zf.extractall(data_dir)
AssetService.update_all_asset_lists()
print(f"자산 팩 설치 완료: {data_dir}")
