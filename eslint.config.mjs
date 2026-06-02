import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-source dirs — archived rod, generated graph output, runtime queue,
    // one-off node scripts and planning docs. Linting these (esp. the large
    // _archive and graphify-out JSON) OOM-ed ESLint and is not meaningful.
    "_archive/**",
    "graphify-out/**",
    ".send_queue/**",
    "scripts/**",
    "docs/**",
    "public/**",
  ]),
]);

export default eslintConfig;
