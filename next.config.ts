import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Lighthouse + chrome-launcher are heavy Node-only packages used via dynamic
  // import in src/lib/seo.ts (runs headless Chrome locally). Keep them external
  // so the server build never tries to bundle their dynamic requires.
  serverExternalPackages: ["lighthouse", "chrome-launcher"],
  turbopack: {
    root: __dirname,
    resolveAlias: {
      tailwindcss: path.resolve(__dirname, "node_modules/tailwindcss"),
    },
  },
};

export default nextConfig;
