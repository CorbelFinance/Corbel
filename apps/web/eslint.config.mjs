import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "e2e/screens/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
];

export default config;
