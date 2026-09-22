import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

const nodeSrcGlobs = ["backend/src/**/*.ts", "services/src/**/*.ts", "workers/src/**/*.ts"];
const frontendSrcGlobs = ["frontend/src/**/*.ts", "frontend/src/**/*.tsx"];

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "**/build/**"],
  },
  {
    files: [...nodeSrcGlobs, ...frontendSrcGlobs],
    extends: [tseslint.configs.recommended],
  },
  {
    files: nodeSrcGlobs,
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: frontendSrcGlobs,
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
