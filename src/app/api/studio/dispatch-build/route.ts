import { NextResponse, type NextRequest } from "next/server";
import { reconFull, loadReconFull, type FullReconInput } from "@/lib/customer-recon-full";
import { buildClaudeCodePrompt } from "@/lib/prompt-builder";
import { templateBySlug, templateForBranch } from "@/lib/design-templates";
import { slugify } from "@/lib/customer-recon";
import { store } from "@/lib/store";

// POST /api/studio/dispatch-build { name, branch, websiteUrl?, gmbUrl?, igNotes?, templateSlug? }
// Builds the Claude Code build-prompt from cached (or fresh) recon + the branch
// template, persists it under dispatch/<slug>, and returns it. This is NOT a true
// programmatic dispatch (no dispatch MCP exists) — it PREPARES the prompt; a
// Claude Code session (orchestrator subagent or human) runs the actual build.
// Auth-gated because it embeds externally-scraped content + emits a /bypass prompt.
export const dynamic = "force-dynamic";
export const maxDuration = 45;

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function checkAuth(req: NextRequest): boolean {
  const expected = process.env.STUDIO_DISPATCH_SECRET || process.env.DEEP_RESEARCH_SECRET;
  if (!expected) return true; // no secret configured ⇒ local/dev open (same as approve/add)
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return Boolean(m && ctEqual(m[1], expected));
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: Partial<FullReconInput> & { templateSlug?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = String(b.name ?? "").trim();
  const branch = String(b.branch ?? "").trim();
  if (!name) return NextResponse.json({ error: "name påkrævet" }, { status: 400 });

  // Resolve template — explicit slug wins, else infer from branch. Hard-fail on miss.
  const template = (b.templateSlug && templateBySlug(b.templateSlug)) || templateForBranch(branch);
  if (!template) {
    return NextResponse.json({ error: `ukendt branche/template: ${branch || b.templateSlug}` }, { status: 422 });
  }

  const slug = slugify(name);
  // R2 council MED: belt-and-suspenders path-traversal guard. slugify already
  // collapses to [a-z0-9-], but the slug names a build dir — assert it hard.
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) {
    return NextResponse.json({ error: "ugyldigt slug fra navn" }, { status: 400 });
  }
  let recon = await loadReconFull(slug);
  if (!recon) {
    recon = await reconFull({
      name, branch,
      websiteUrl: b.websiteUrl?.trim() || undefined,
      gmbUrl: b.gmbUrl?.trim() || undefined,
      igNotes: b.igNotes?.trim() || undefined,
    });
  }

  // Council R1+R2: abort on near-empty recon rather than silently building
  // generic. Need ≥2 real signals (palette / headings / tone / title / desc).
  const signals = [recon.palette.length > 0, recon.headings.length > 0, !!recon.toneSample, !!recon.title, !!recon.description].filter(Boolean).length;
  if (signals < 2) {
    return NextResponse.json(
      { ok: false, error: "Recon kom tom tilbage — angiv en side/FB-URL med mere indhold eller indsæt IG-noter", recon },
      { status: 422 },
    );
  }

  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || "main";
  const prompt = buildClaudeCodePrompt(
    { name, branch, slug, websiteUrl: b.websiteUrl?.trim(), gmbUrl: b.gmbUrl?.trim(), contactEmail: undefined },
    recon,
    template,
    gitSha,
  );

  // Persist for reuse / audit. Best-effort.
  try {
    await store.put(`dispatch/${slug}`, { slug, name, branch, template: template.slug, gitSha, prompt, builtAt: Date.now() });
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true,
    slug,
    template: template.slug,
    gitSha,
    chars: prompt.length,
    prompt,
    note: "Prompt forberedt + gemt. Kør den i en Claude Code-session (gratis på subscription) for at bygge demoen.",
  });
}
