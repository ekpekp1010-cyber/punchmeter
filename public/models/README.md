# 3D 캐릭터 파일

| 파일 | 내용 |
|---|---|
| `fighter_male.glb` | 남자 선수 (MPFB 기본 체형, 키 약 1.73 m) |
| `fighter_female.glb` | 여자 선수 (MPFB 기본 체형, 키 약 1.59 m) |

## 만든 방법

- Blender 5.3 + MPFB 2.0.18 확장 기능 + "MakeHuman system assets" 자산 팩
- 만드는 스크립트: [`scripts/blender/make_fighters.py`](../../scripts/blender/make_fighters.py)
  ```
  blender --background --python scripts/blender/make_fighters.py -- public/models
  ```
- 뼈대: MPFB "game_engine" (뼈 53개, `upperarm_r`·`lowerarm_r`·`thigh_l`·`calf_l` 같은 이름)
- 피부: `young_caucasian_male_special_suit` / `young_caucasian_female_special_suit`
- 눈 `high-poly`, 눈썹 `eyebrow001`, 속눈썹 `eyelashes01`
- 체형은 평균값에서 성별만 정했다. 입력한 키·체중에 맞추는 일은 PLAN 작업 9에서 한다.

## 라이선스

- MPFB의 기본 자산(기본 몸 메시, 체형 타깃, 피부, 눈 등)은 **CC0**(누구나 자유롭게 사용, 출처 표시 의무 없음)로 공개되어 있다.
  - 출처: MPFB FAQ "Can I sell models made with MPFB?" — https://static.makehumancommunity.org/mpfb/faq/can_i_sell_models.html
  - 자산 팩: https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html (모든 항목 CC0)
- MPFB 확장 기능 자체(프로그램)는 GPL v3이지만, 이 폴더에는 프로그램이 아니라 만든 결과물만 들어 있다.
