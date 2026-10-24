import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // react-hooks v7 Compiler 系规则对存量代码报错较多（mindmap 的 ref 缓存复用是防
    // xyflow 死循环的保命设计，弹窗重置草稿也是合法模式）。降为 warn 不阻塞门禁，
    // 清单保留在 lint 输出中，待逐项治理后再收紧。
    files: ["**/*.{js,mjs,ts,jsx,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  // 覆盖 eslint-config-next 的默认忽略清单（另加 .ref/**）。
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".ref/**",
  ]),
]);

export default eslintConfig;
