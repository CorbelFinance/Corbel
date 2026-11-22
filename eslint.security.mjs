// Security-only lint pass (run from the repo root: npx eslint -c eslint.security.mjs --no-config-lookup apps/web packages tools)
// eslint-plugin-security (Node.js risky patterns) + eslint-plugin-no-unsanitized (Mozilla: unsafe HTML sinks).
import tseslint from "./packages/data/node_modules/typescript-eslint/dist/index.js";
import security from "eslint-plugin-security";
import nounsanitized from "eslint-plugin-no-unsanitized";

export default [
  { ignores: ["**/.next/**", "**/node_modules/**", "**/e2e/**", "**/out/**", "**/cache/**", "tools/scan/**", "packages/contracts/**", "**/*.test.ts", "**/trustSimBytecode.ts", "next-env.d.ts"] },
  {
    files: ["**/*.{ts,tsx,mjs}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { security, "no-unsanitized": nounsanitized },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      ...security.configs.recommended.rules,
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
    },
  },
];
