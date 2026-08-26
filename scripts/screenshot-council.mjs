// Capture-only input til det faste screenshot-council-loop.
// Hermes-cro­nen læser manifestet og bruger vision + uafhængige kritikroller.
// Ingen auto-fix, mail, deploy eller push her.
//
// ponytail: capture og council er adskilt. Det gør fejlsøgning mulig og
// undgår at binde screenshots til en bestemt model/API-rate-limit.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const API_BASE = process.env.LEAD_SYSTEM_URL || "https://lead-finder-three-beta.vercel.app";
const PREVIEW_ORIGIN = process.env.PREVIEW_ORIGIN || "";
const SECRET = process.env.PREVIEW_QUEUE_SECRET || process.env.DEEP_RESEARCH_SECRET;
const OUT_DIR = process.env.SCREENSHOT_OUT_DIR || "/tmp/kinly-screenshot-council";
const ACTIVE_STATUSES = new Set(["bygger", "preview klar", "godkendt", "kladde klar"]);

if (!SECRET) {
  console.error("PREVIEW_QUEUE_SECRET eller DEEP_RESEARCH_SECRET mangler — stop.");
  process.exit(1);
}

function previewUrl(raw) {
  const parsed = new URL(raw);
  // Local fixture URLs point at port 3000. PREVIEW_ORIGIN lets local verification
  // use another port without changing the stored preview record.
  if (PREVIEW_ORIGIN && /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)) {
    const target = new URL(PREVIEW_ORIGIN);
    parsed.protocol = target.protocol;
    parsed.hostname = target.hostname;
    parsed.port = target.port;
  }
  return parsed.toString();
}

async function fetchQueue() {
  const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/previews`, {
    headers: { authorization: `Bearer ${SECRET}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`previews GET ${res.status}`);
  return (await res.json()).requests ?? [];
}

async function capture(page, rawUrl, path) {
  const url = previewUrl(rawUrl);
  let responseStatus = null;
  let navigationError = null;
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    responseStatus = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(900); // fonts, client sections and simple animations
  } catch (error) {
    navigationError = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180);
  }
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  await page.screenshot({ path, fullPage: true, type: "jpeg", quality: 74 });
  return {
    url,
    path,
    responseStatus,
    title,
    bodyChars: bodyText.trim().length,
    bodyPreview: bodyText.trim().replace(/\s+/g, " ").slice(0, 240),
    emptyBody: bodyText.trim().length < 20,
    navigationError,
  };
}

mkdirSync(OUT_DIR, { recursive: true });
const queue = await fetchQueue();
const targets = queue.filter((item) => item.previewUrl && ACTIVE_STATUSES.has(item.status));
const manifest = {
  generatedAt: new Date().toISOString(),
  apiBase: API_BASE,
  targetCount: targets.length,
  items: [],
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const item of targets) {
    const safeId = String(item.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const desktop = await capture(page, item.previewUrl, `${OUT_DIR}/${safeId}-desktop.jpg`);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await capture(page, item.previewUrl, `${OUT_DIR}/${safeId}-mobile.jpg`);
    await page.close();
    manifest.items.push({
      id: item.id,
      company: item.company,
      status: item.status,
      branch: item.branch || null,
      previewUrl: item.previewUrl,
      reviewNotes: item.reviewNotes || "",
      desktop,
      mobile,
    });
  }
} finally {
  await browser.close();
}

const manifestPath = `${OUT_DIR}/manifest.json`;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ok: true, manifestPath, targetCount: manifest.targetCount, items: manifest.items }, null, 2));
