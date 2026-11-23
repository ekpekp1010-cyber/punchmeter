// 테스트 도구(Vitest) 설정: trash-can(지울 파일을 임시로 옮겨 둔 폴더)의 테스트는 돌리지 않는다
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "trash-can/**"],
  },
});
