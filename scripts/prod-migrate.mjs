// Kører drizzle-migrationerne før `next build`, men KUN i Vercels production-build.
// 0020 lå ukørt i prod 16-19/10 og /marketing var nede i 3 dage uden at nogen så det.
// Preview, CI og lokalt springer over. Fejler migrationen, fejler deployet, og den gamle version bliver live.
if (process.env.VERCEL_ENV !== "production") {
  console.log(`prod-migrate: springer over (VERCEL_ENV=${process.env.VERCEL_ENV ?? "-"})`);
} else {
  await import("./db-migrate.mjs");
}
