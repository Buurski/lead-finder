"use client";
// Kort-dialogen: SEO-felter (live tællere), A/B-billedvalg, tjekliste,
// faktatjek og fase-flyt. Body er read-only — redigering af brødteksten er
// uden for scope her (spec). Henter det fulde indlæg selv (listen på tavlen
// er uden body, jf. listPosts' kommentar).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/shell/Icon";
import type { BlogChecklist, BlogImageCandidate, BlogImages, BlogProofs, BlogStage, ImageChoice, PostCard } from "@/lib/hq/posts";
import type { StageInfo } from "./BlogBoard";
import { BLOG_CATEGORIES, SEO_LIMITS, categoryLabel, countWords, isCustomerImage } from "./blog-utils";

interface FullPost {
  id: string;
  title: string;
  slug: string;
  category: string;
  stage: BlogStage;
  excerpt: string;
  body: string;
  images: BlogImages;
  proofs: BlogProofs;
  checklist: BlogChecklist;
  publishedUrl: string | null;
}

async function patchPost(id: string, body: Record<string, unknown>): Promise<FullPost> {
  const res = await fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "kunne ikke gemme");
  return data.post as FullPost;
}

async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "kunne ikke slette");
}

function Counter({ value, min, max }: { value: number; min?: number; max: number }) {
  const bad = value > max || (min !== undefined && value < min);
  return (
    <span className="bl-counter" data-bad={bad}>
      {value}/{min !== undefined ? `${min}-${max}` : max}
    </span>
  );
}

export default function PostDialog({
  id,
  stages,
  onClose,
  onSaved,
  onDeleted,
}: {
  id: string;
  stages: StageInfo[];
  onClose: () => void;
  onSaved: (patch: Partial<PostCard>) => void;
  onDeleted: (id: string) => void;
}) {
  const [post, setPost] = useState<FullPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [consentA, setConsentA] = useState("");
  const [altA, setAltA] = useState("");
  const [altB, setAltB] = useState("");
  const [consentB, setConsentB] = useState("");
  const [factNote, setFactNote] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/posts/${id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "kunne ikke hente indlægget");
        return data.post as FullPost;
      })
      .then((p) => {
        if (!live) return;
        setPost(p);
        setTitle(p.title);
        setSlug(p.slug);
        setCategory(p.category);
        setExcerpt(p.excerpt);
        setConsentA(p.images.a?.consentRef ?? "");
        setAltA(p.images.a?.alt ?? "");
        setAltB(p.images.b?.alt ?? "");
        setConsentB(p.images.b?.consentRef ?? "");
      })
      .catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : "kunne ikke hente indlægget"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  async function run(body: Record<string, unknown>) {
    if (busy) return null;
    setBusy(true);
    setNotice(null);
    try {
      const next = await patchPost(id, body);
      setPost(next);
      onSaved({ title: next.title, category: next.category, checklist: next.checklist, images: next.images, stage: next.stage });
      setNotice({ kind: "success", text: "Gemt." });
      return next;
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "kunne ikke gemme" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  // Efter gem: felterne sættes til serverens værdier (den trimmer), så "ugemt" ikke hænger
  // fast — men kun felter brugeren ikke har rettet igen, mens gemningen kørte (Sol w4a-r4 R4-02).
  async function saveSeo() {
    const sent = { title, slug, category, excerpt };
    const next = await run(sent);
    if (!next) return;
    setTitle((cur) => (cur === sent.title ? next.title : cur));
    setSlug((cur) => (cur === sent.slug ? next.slug : cur));
    setCategory((cur) => (cur === sent.category ? next.category : cur));
    setExcerpt((cur) => (cur === sent.excerpt ? next.excerpt : cur));
  }

  function chooseImage(choice: ImageChoice) {
    void run({ images: { choice } });
  }

  function saveConsent(slot: "a" | "b") {
    if (!post) return;
    const cand = slot === "a" ? post.images.a : post.images.b;
    if (!cand) return;
    const value = slot === "a" ? consentA : consentB;
    const full: BlogImageCandidate = { ...cand, consentRef: value };
    void run({ images: { [slot]: full } });
  }

  // Alt-tekst rettes her, så checklistens alt-krav kan løses fra tavlen (Sol w4a R3).
  // Serveren nulstiller valget, hvis et valgt billede ændres — så vælger man igen.
  function saveAlt(slot: "a" | "b") {
    if (!post) return;
    const cand = slot === "a" ? post.images.a : post.images.b;
    if (!cand) return;
    const full: BlogImageCandidate = { ...cand, alt: (slot === "a" ? altA : altB).trim() };
    void run({ images: { [slot]: full } });
  }

  function saveFactcheck() {
    void run({ proofs: { factcheck: { note: factNote } } });
  }

  function moveStage(dir: -1 | 1) {
    if (!post) return;
    const idx = stages.findIndex((s) => s.stage === post.stage);
    const next = stages[idx + dir];
    if (!next) return;
    void run({ stage: next.stage });
  }

  function submitForPublish() {
    void run({ stage: "publicer" });
  }

  async function handleDelete() {
    if (!post) return;
    if (!confirm(`Slet "${post.title || "indlægget"}"? Det kan ikke fortrydes.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      await deletePost(id);
      onDeleted(id);
      onClose();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "kunne ikke slette" });
      setBusy(false);
    }
  }

  // Ugemt alt-tekst skal spærre publicering ligesom SEO-felterne (Lucas' fund):
  // begge er "dirty"-agtige rettelser, der ellers stille forsvinder ved luk/skift.
  const altDirty = Boolean(
    (post?.images.a && altA.trim() !== post.images.a.alt) ||
    (post?.images.b && altB.trim() !== post.images.b.alt)
  );
  const dirty = post ? title !== post.title || slug !== post.slug || category !== post.category || excerpt !== post.excerpt || altDirty : false;
  const idx = post ? stages.findIndex((s) => s.stage === post.stage) : -1;
  const canPublish = post ? post.stage !== "publicer" && post.stage !== "udgivet" : false;
  const locked = post?.stage === "udgivet"; // alle felt-rettelser er låst server-side her
  const canDelete = post ? post.stage === "ide" || post.stage === "arbejder" : false;
  const prevBlocked = post?.stage === "udgivet"; // "et udgivet indlæg kan ikke flyttes tilbage"
  const nextBlocked = post?.stage === "publicer"; // "Udgivet sættes automatisk" — kun markPublished må

  function requestClose() {
    if (dirty && !confirm("Du har ændringer der ikke er gemt. Luk alligevel?")) return;
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") requestClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  return createPortal(
    <div
      className="bl-dialog-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div className="bl-dialog cc-card" role="dialog" aria-modal="true" aria-label="Blogindlæg">
        <div className="bl-dialog-head">
          <div className="bl-dialog-head-main">
            <strong>{post?.title || "Indlæg"}</strong>
            {post?.publishedUrl && (
              <a className="cc-link bl-live-link" href={post.publishedUrl} target="_blank" rel="noreferrer">
                <Icon name="ArrowUpRight" style={{ width: 13, height: 13 }} />{post.publishedUrl}
              </a>
            )}
          </div>
          <button type="button" className="bl-close-btn cc-focus" onClick={requestClose} aria-label="Luk">
            <Icon name="X" style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {notice && (
          <p role="alert" className={`bl-dialog-notice ${notice.kind === "error" ? "bl-error" : "bl-success"}`}>{notice.text}</p>
        )}

        <div className="bl-dialog-content">
          {loading && <div className="cc-skel" style={{ height: 200 }} />}
          {!loading && loadError && <p role="alert" className="bl-error">{loadError}</p>}

          {!loading && post && (
            <div className="bl-dialog-body">
              {/* --- SEO --- */}
              <section className="bl-section">
                <h3 className="bl-section-title">SEO</h3>
                <label className="bl-field">
                  <span>Titel <Counter value={title.length} max={SEO_LIMITS.title} /></span>
                  <input className="bl-input" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                {title.length > SEO_LIMITS.title && (
                  <p className="bl-field-warn" role="alert">Titlen er for lang — Google skærer den af over {SEO_LIMITS.title} tegn.</p>
                )}
                <label className="bl-field">
                  <span>Slug</span>
                  <input className="bl-input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="udledes af titlen hvis tom" />
                </label>
                <label className="bl-field">
                  <span>Kategori</span>
                  <select className="bl-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">— vælg kategori —</option>
                    {BLOG_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                  </select>
                </label>
                <label className="bl-field">
                  <span>Uddrag <Counter value={excerpt.length} min={SEO_LIMITS.excerptMin} max={SEO_LIMITS.excerpt} /></span>
                  <textarea className="bl-input bl-textarea" maxLength={300} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
                </label>
                {excerpt.length > 0 && (excerpt.length < SEO_LIMITS.excerptMin || excerpt.length > SEO_LIMITS.excerpt) && (
                  <p className="bl-field-warn" role="alert">Uddraget skal være mellem {SEO_LIMITS.excerptMin} og {SEO_LIMITS.excerpt} tegn.</p>
                )}
                <div className="bl-snippet">
                  <div className="bl-snippet-url">kinly.dk/blog/{slug || "…"}/</div>
                  <div className="bl-snippet-title">{title || "(uden titel)"}</div>
                  <div className="bl-snippet-desc">{excerpt || "(intet uddrag endnu)"}</div>
                </div>
                {!locked && (
                  <div className="bl-dialog-actions">
                    <button type="button" className="cc-btn cc-btn-accent" onClick={() => void saveSeo()} disabled={busy || !dirty}>{busy ? "Gemmer…" : "Gem SEO-felter"}</button>
                  </div>
                )}
              </section>

              {/* --- A/B billeder --- */}
              <section className="bl-section">
                <h3 className="bl-section-title">A/B-billede</h3>
                {!post.images.a && !post.images.b ? (
                  <p className="cc-dim">Ingen billedkandidater endnu.</p>
                ) : (
                  <>
                    <div className="bl-ab-grid">
                      {(["a", "b"] as const).map((slot) => {
                        const cand = slot === "a" ? post.images.a : post.images.b;
                        if (!cand) return <div key={slot} className="bl-ab-empty">Ingen kandidat {slot.toUpperCase()}</div>;
                        const chosen = post.images.choice === slot || post.images.choice === "both";
                        const heroLabel = post.images.choice === "both" ? (slot === "a" ? "Hero" : "I teksten") : chosen ? "Hero" : null;
                        const consentVal = slot === "a" ? consentA : consentB;
                        const setConsentVal = slot === "a" ? setConsentA : setConsentB;
                        const custImg = isCustomerImage(cand);
                        const altVal = slot === "a" ? altA : altB;
                        return (
                          <div key={slot} className="bl-ab-cand" data-chosen={chosen}>
                            <div className="bl-ab-crop">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={cand.url} alt={cand.alt} />
                              {heroLabel && <span className="bl-hero-badge">{heroLabel}</span>}
                              {cand.placement && <span className="bl-placement-badge">{cand.placement}</span>}
                            </div>
                            {chosen && (
                              <div className="bl-og-crop">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={cand.url} alt="" />
                                <span className="bl-og-label">OG 1200×630</span>
                              </div>
                            )}
                            <div className="bl-ab-meta">
                              <label className="bl-field bl-ab-alt">
                                <span>Alt-tekst <Counter value={altVal.length} min={SEO_LIMITS.altMin} max={SEO_LIMITS.alt} /></span>
                                <textarea className="bl-input bl-textarea" rows={2} value={altVal} onChange={(e) => (slot === "a" ? setAltA : setAltB)(e.target.value)} maxLength={200} placeholder="Beskriv hvad billedet viser (ikke 'billede af')" />
                              </label>
                              {!locked && altVal.trim() !== cand.alt && (
                                <button type="button" className="cc-btn" onClick={() => saveAlt(slot)} disabled={busy}>
                                  Gem alt-tekst{chosen ? " (valget skal tages igen bagefter)" : ""}
                                </button>
                              )}
                              <div className="cc-dim bl-ab-credit">{cand.credit || "ingen kredit"} · {cand.source || "ingen kilde"}</div>
                            </div>
                            {custImg && (
                              <div className="bl-consent">
                                <p className="bl-warn">Dette ligner et kundebillede — kundens samtykke skal registreres.</p>
                                <label className="bl-field">
                                  <span>Samtykke (fx &quot;mail 2026-09-20 fra Allan&quot;)</span>
                                  <input className="bl-input" value={consentVal} onChange={(e) => setConsentVal(e.target.value)} maxLength={200} />
                                </label>
                                {!locked && (
                                  <button type="button" className="cc-btn" onClick={() => saveConsent(slot)} disabled={busy || consentVal === (cand.consentRef ?? "")}>Gem samtykke</button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!locked && (
                      <div className="bl-dialog-actions">
                        <button type="button" className="cc-btn" data-on={post.images.choice === "a"} disabled={busy || !post.images.a} onClick={() => chooseImage("a")} title={!post.images.a ? "Ingen kandidat A" : undefined}>Vælg A</button>
                        <button type="button" className="cc-btn" data-on={post.images.choice === "b"} disabled={busy || !post.images.b} onClick={() => chooseImage("b")} title={!post.images.b ? "Ingen kandidat B" : undefined}>Vælg B</button>
                        <button type="button" className="cc-btn" data-on={post.images.choice === "both"} disabled={busy || !post.images.a || !post.images.b} onClick={() => chooseImage("both")} title={!post.images.a || !post.images.b ? "Kræver begge kandidater" : undefined}>Begge (A = hero, B i teksten)</button>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* --- tjekliste --- */}
              <section className="bl-section">
                <h3 className="bl-section-title">Tjekliste</h3>
                {post.checklist.ok ? (
                  <p className="bl-checklist-ok">Klar til publicering.</p>
                ) : (
                  <ul className="bl-checklist-list">
                    {post.checklist.missing.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </section>

              {/* --- faktatjek --- */}
              <section className="bl-section">
                <h3 className="bl-section-title">Faktatjek</h3>
                {post.proofs.factcheck && (
                  <p className="cc-dim">
                    Sidst faktatjekket af {post.proofs.factcheck.by} ({new Date(post.proofs.factcheck.at).toLocaleString("da-DK")})
                    {post.proofs.factcheck.revision !== post.checklist.revision && " — gælder en ældre version"}
                  </p>
                )}
                {!locked && (
                  <>
                    <label className="bl-field">
                      <span>Note</span>
                      <textarea className="bl-input bl-textarea" maxLength={300} value={factNote} onChange={(e) => setFactNote(e.target.value)} placeholder="Fx: ingen opdigtede kunder, citater eller tal" />
                    </label>
                    <div className="bl-dialog-actions">
                      <button type="button" className="cc-btn" onClick={saveFactcheck} disabled={busy}>Jeg har faktatjekket denne version</button>
                    </div>
                  </>
                )}
              </section>

              {/* --- fase --- */}
              <section className="bl-section">
                <h3 className="bl-section-title">Fase</h3>
                <div className="bl-dialog-actions">
                  <button type="button" className="cc-btn cc-focus" aria-label="Forrige fase" onClick={() => moveStage(-1)} disabled={busy || idx <= 0 || prevBlocked} title={prevBlocked ? "Et udgivet indlæg kan ikke flyttes tilbage" : undefined}>
                    <Icon name="ChevronRight" style={{ width: 15, height: 15, transform: "rotate(180deg)" }} />
                  </button>
                  <span className="bl-stage-current">{stages[idx]?.label ?? post.stage}</span>
                  <button type="button" className="cc-btn cc-focus" aria-label="Næste fase" onClick={() => moveStage(1)} disabled={busy || dirty || idx < 0 || idx >= stages.length - 1 || nextBlocked} title={dirty ? "Gem SEO-felterne først" : nextBlocked ? "Udgivet sættes automatisk, når opslaget er live på kinly.dk" : undefined}>
                    <Icon name="ChevronRight" style={{ width: 15, height: 15 }} />
                  </button>
                  {canPublish && dirty && <span className="cc-dim" style={{ fontSize: 12 }}>Gem SEO-felterne først — ellers publiceres den gemte version.</span>}
                  {canPublish && (
                    <button type="button" className="cc-btn cc-btn-accent" onClick={submitForPublish} disabled={busy || dirty || !post.checklist.ok} title={dirty ? "Gem SEO-felterne først" : !post.checklist.ok ? "Tjeklisten er ikke grøn" : undefined}>Send til publicering</button>
                  )}
                  {canDelete && (
                    <button type="button" className="cc-btn bl-btn-danger" onClick={() => void handleDelete()} disabled={busy}>Slet</button>
                  )}
                </div>
              </section>

              {/* --- brødtekst (read-only) --- */}
              <section className="bl-section">
                <h3 className="bl-section-title">Brødtekst <span className="cc-dim">({countWords(post.body)} ord)</span></h3>
                <pre className="bl-body-text">{post.body || "(ingen tekst endnu)"}</pre>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
