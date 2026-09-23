import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Lighthouse + chrome-launcher are heavy Node-only packages used via dynamic
  // import in src/lib/seo.ts (runs headless Chrome locally). Keep them external
  // so the server build never tries to bundle their dynamic requires.
  serverExternalPackages: ["lighthouse", "chrome-launcher"],
  // Bundle the committed single-file demos so /studio/demo-site/<slug> can read
  // them at runtime on Vercel (dist/ is gitignored; demo-sites/ is committed).
  outputFileTracingIncludes: {
    "/studio/demo-site/[slug]": ["./demo-sites/**/*.html"],
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      tailwindcss: path.resolve(__dirname, "node_modules/tailwindcss"),
    },
  },
  // Fase 2 IA-skifte (docs/superpowers/plans/2026-09-22-crm-hq-fase-2-skal-hq.md,
  // Task 1). Ikke-permanente indtil fase 3 låser den nye IA fast.
  async redirects() {
    return [
      { source: "/send", destination: "/approve", permanent: false },
      { source: "/radar", destination: "/leadgen", permanent: false },
      { source: "/claude", destination: "/hermes", permanent: false },
      { source: "/salg", destination: "/pipeline", permanent: false },
      { source: "/leads", destination: "/pipeline", permanent: false },
      { source: "/clients", destination: "/virksomheder", permanent: false },
      { source: "/clients/:id", destination: "/virksomheder/c/:id", permanent: false },
      { source: "/crm", destination: "/", permanent: false },
      // /goals var en stale intern 90-dages roadmap (juni 2026, ikke i nav,
      // blandede forældede mål med priser) — siden er slettet (w3-inbox QA-fund #11).
      { source: "/goals", destination: "/", permanent: false },
      // /admin/migrering var engangsværktøjet til Sheets→Postgres-flytningen,
      // færdig 22/9 — siden + ruten + src/lib/pg/migrate.ts er slettet (QA-fund #12).
      { source: "/admin/migrering", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
