import js from "@eslint/js";
import next from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const config = [
  js.configs.recommended,
  ...next,
  ...tseslint.configs.recommended,
  { ignores: [".next/**", "node_modules/**"] },
];

export default config;
