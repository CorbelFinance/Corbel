import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "e2e/screens/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  // server code works on lists that grow without a bound: Math.min(...list) throws past ~100k items and took the
  // big-swaps page down (25 Nov 2026). Use a loop or reduce there.
  {
    files: ["app/api/**/*.ts", "lib/**/*.ts", "instrumentation.ts"],
    rules: {
      "no-restricted-syntax": ["error", { selector: "CallExpression[callee.object.name='Math'][callee.property.name=/^(min|max)$/] > SpreadElement", message: "Math.min/max with a spread overflows the stack on large lists. Use reduce or a loop." }],
    },
  },
];

export default config;
