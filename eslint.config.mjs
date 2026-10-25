import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 覆盖 eslint-config-next 的默认忽略清单（另加 .ref/**）。
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".ref/**",
  ]),
  {
    rules: {
      "linebreak-style": ["error", "unix"],
    },
  },
  // TODO 84：type-aware 规则（取自 typescript-eslint recommended-type-checked，
  // 只开这两条——不开全集，避免 no-unsafe-* 家族对存量引发大面积重写）。
  // 需要 projectService 提供类型信息；tsconfig include 已覆盖全仓 .ts/.tsx。
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  // node:test 的 describe/it/test 返回 Promise 属 runner 协议，顶层调用按设计
  // 不 await（await 了反而改变注册时序语义）；测试内真实的漏 await 由
  // node:test 的 unhandled rejection 兜底暴露，不依赖此规则。
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
]);

export default eslintConfig;
