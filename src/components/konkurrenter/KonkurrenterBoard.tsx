"use client";
// /konkurrenter — ugentlig Jev-scan af danske webbureauer/freelancere/AI-byggere
// (Hermes, søndag nat, via POST /api/agent/competitors). Rent visnings-lag: al
// validering ligger i competitors.ts, denne komponent sorterer/fletter/viser.
//
// Handlingskø fletter to kilder til én visning: nye `findings` (kategoriseret,
// vurderet, med foreslået handling) og gamle `gaps` (bagudkompatible — vises
// uden rating-prikker). "Lav blog-idé" genbruger den eksisterende menneske-rute
// (POST /api/posts), "Annonce-idé"/"Gem til senere" genbruger /api/opgaver
// (opret + PATCH note — tasks.ts' createTask har ingen note-parameter, så
// noten sættes i et andet kald i stedet for at udvide den delte skrive-vej).
import { useEffect, useMemo, useState } from "react";
import type {
  Competitor,
  CompetitorGap,
  CompetitorKind,
  CompetitorPattern,
  CompetitorReport,
  FindingCategory,
  FindingSuggest,
  GapKind,
  MessagingAngle,
} from "@/lib/hq/competitors";
import Icon from "@/components/shell/Icon";
import "./konkurrenter.css";

export interface KinlyRow {
  name: string;
  url: string;
  https: boolean;
  services: string[];
  blogPosts30d: number;
  positioning: string;
}

export interface SavedIdea {
  id: string;
  title: string;
}

const DISMISS_KEY = "konk-dismissed-v1";

const CATEGORY_CHIP_LABEL: Record<FindingCategory, string> = {
  ydelse: "Gør de, vi ikke gør",
  "pris-budskab": "Pris & budskab",
  seo: "SEO",
  geo: "GEO/AI",
  alternativ: "Alternativer (AI-byggere)",
  forbedring: "Forbedringer",
};
const CATEGORY_BADGE_LABEL: Record<FindingCategory, string> = {
  ydelse: "Ydelse",
  "pris-budskab": "Pris & budskab",
  seo: "SEO",
  geo: "GEO/AI",
  alternativ: "Alternativ",
  forbedring: "Forbedring",
};
const GAP_TO_CATEGORY: Record<GapKind, FindingCategory> = {
  indhold: "seo",
  ydelse: "ydelse",
  pris: "pris-budskab",
  synlighed: "geo",
};
// Kategori → kinly.dk's blog-kategorier (content/blog/categories.ts). "alternativ"
// og "forbedring" handler om Kinlys egen positionering, ikke en SEO/pris-vinkel —
// begge lander i "kinly" (åbent spørgsmål, se rapport).
const CATEGORY_TO_BLOG: Record<FindingCategory, string> = {
  ydelse: "hjemmeside",
  "pris-budskab": "pris",
  seo: "lokal-synlighed",
  geo: "ai-soegning",
  alternativ: "kinly",
  forbedring: "kinly",
};
const KIND_ORDER: CompetitorKind[] = ["bureau", "freelancer", "ai-bygger"];
const KIND_LABEL: Record<CompetitorKind, string> = {
  bureau: "Bureauer",
  freelancer: "Freelancere",
  "ai-bygger": "AI-byggere / alternativer",
};
const ANGLE_LABEL: Record<MessagingAngle, string> = {
  pris: "Pris",
  hastighed: "Hastighed",
  ai: "AI",
  lokal: "Lokal",
  garanti: "Garanti",
};

interface DisplayFinding {
  id: string;
  category: FindingCategory;
  title: string;
  detail: string;
  rating?: number;
  evidence: string[];
  suggest: FindingSuggest;
}

function gapsToFindings(gaps: CompetitorGap[]): DisplayFinding[] {
  return gaps.map((g, i) => ({
    id: `gap-${i}`,
    category: GAP_TO_CATEGORY[g.kind],
    title: g.title,
    detail: g.detail,
    evidence: [],
    suggest: "blog",
  }));
}

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function persistDismissed(s: Set<string>): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...s]));
  } catch {
    /* privat browsing e.l. — ikke kritisk, kortet dukker bare op igen */
  }
}

function fbAdsUrl(name: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=DK&q=${encodeURIComponent(name)}&search_type=keyword_unordered`;
}
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function googleAdsUrl(url: string): string {
  const domain = domainOf(url);
  const safe = domain && /^[a-z0-9.-]+$/i.test(domain);
  return `https://adstransparency.google.com/?region=DK${safe ? `&domain=${encodeURIComponent(domain)}` : ""}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
}

function RatingDots({ rating }: { rating?: number }) {
  if (!rating) return null;
  return (
    <span className="konk-dots" aria-label={`Vurdering ${rating} af 5`} title={`${rating} af 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="konk-dot" data-on={i < rating} />
      ))}
    </span>
  );
}

type ActionKey = "blog" | "annonce" | "gem" | "afvis";
type ActionState = "idle" | "busy" | "done" | "error";

function FindingCard({ f, big = false, onDismiss }: { f: DisplayFinding; big?: boolean; onDismiss: (id: string) => void }) {
  const [state, setState] = useState<Partial<Record<ActionKey, ActionState>>>({});
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const primary: ActionKey = f.suggest === "blog" ? "blog" : f.suggest === "annonce" ? "annonce" : "gem";

  function noteFor(f: DisplayFinding): string {
    const parts = [f.detail, ...f.evidence];
    return parts.join(" — ").slice(0, 4000);
  }

  async function doBlog() {
    setState((s) => ({ ...s, blog: "busy" }));
    setError("");
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: f.title.slice(0, 60), note: noteFor(f).slice(0, 300), category: CATEGORY_TO_BLOG[f.category] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "kunne ikke oprette idéen");
      setState((s) => ({ ...s, blog: "done" }));
    } catch (err) {
      setState((s) => ({ ...s, blog: "error" }));
      setError(err instanceof Error ? err.message : "kunne ikke oprette idéen");
    }
  }

  async function doTask(kind: "annonce" | "gem") {
    setState((s) => ({ ...s, [kind]: "busy" }));
    setError("");
    try {
      const title = (kind === "annonce" ? `Annonce-idé: ${f.title}` : `Idé: ${f.title}`).slice(0, 200);
      const res = await fetch("/api/opgaver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "lucas", title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "kunne ikke oprette");
      const id = data.task?.id as string | undefined;
      if (id) {
        await fetch(`/api/opgaver/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: noteFor(f) }),
        }).catch(() => {});
      }
      setState((s) => ({ ...s, [kind]: "done" }));
    } catch (err) {
      setState((s) => ({ ...s, [kind]: "error" }));
      setError(err instanceof Error ? err.message : "kunne ikke oprette");
    }
  }

  function doDismiss() {
    onDismiss(f.id);
  }

  function btnLabel(key: Exclude<ActionKey, "afvis">, idleLabel: string, doneLabel: string) {
    const s = state[key];
    if (s === "done") return doneLabel;
    if (s === "busy") return "…";
    return idleLabel;
  }

  return (
    <div className={`konk-finding-card${big ? " konk-finding-big" : ""}`} data-category={f.category}>
      <div className="konk-finding-head">
        <span className="cc-chip konk-finding-chip" data-category={f.category}>{CATEGORY_BADGE_LABEL[f.category]}</span>
        <RatingDots rating={f.rating} />
      </div>
      <h3 className="konk-finding-title">{f.title}</h3>
      <p className={`konk-finding-detail${expanded ? " konk-finding-detail-open" : ""}`}>{f.detail}</p>
      {f.detail.length > 110 && (
        <button type="button" className="konk-finding-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Vis mindre" : "Vis mere"}
        </button>
      )}
      {f.evidence.length > 0 && (
        <div className="konk-finding-evidence">
          {f.evidence.map((e) => (
            <span key={e} className="konk-evidence-chip">{e}</span>
          ))}
        </div>
      )}
      <div className="konk-finding-actions">
        {state.blog === "done" ? (
          <a href="/blog" className="cc-btn konk-action-done">✓ Sendt til Blog</a>
        ) : (
          <button type="button" className={`cc-btn${primary === "blog" ? " cc-btn-accent" : ""}`} disabled={state.blog === "busy"} onClick={doBlog}>
            {btnLabel("blog", "→ Blog-idé", "✓ Sendt til Blog")}
          </button>
        )}
        {state.annonce === "done" ? (
          <a href="/opgaver" className="cc-btn konk-action-done">✓ Gemt</a>
        ) : (
          <button type="button" className={`cc-btn${primary === "annonce" ? " cc-btn-accent" : ""}`} disabled={state.annonce === "busy"} onClick={() => doTask("annonce")}>
            {btnLabel("annonce", "→ Annonce-idé", "✓ Gemt")}
          </button>
        )}
        {state.gem === "done" ? (
          <a href="/opgaver" className="cc-btn konk-action-done">✓ Gemt</a>
        ) : (
          <button type="button" className={`cc-btn${primary === "gem" ? " cc-btn-accent" : ""}`} disabled={state.gem === "busy"} onClick={() => doTask("gem")}>
            {btnLabel("gem", "Gem til senere", "✓ Gemt")}
          </button>
        )}
        <button type="button" className="cc-btn konk-action-dismiss" onClick={doDismiss}>Afvis</button>
      </div>
      {error && <span className="konk-finding-error">{error}</span>}
    </div>
  );
}

function PatternCard({ pattern }: { pattern: CompetitorPattern }) {
  return (
    <div className="konk-pattern-card">
      <h3 className="konk-pattern-title">{pattern.title}</h3>
      <p className="konk-pattern-detail">{pattern.detail}</p>
      {pattern.evidence.length > 0 && (
        <div className="konk-pattern-evidence">
          {pattern.evidence.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="cc-link konk-evidence-link">
              <Icon name="ArrowUpRight" style={{ width: 12, height: 12 }} />
              {domainOf(url) || url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Flag({ on, label }: { on?: boolean; label: string }) {
  return (
    <span className="konk-flag" data-on={Boolean(on)}>
      <span className="konk-flag-dot" />
      {label}
    </span>
  );
}

function CompetitorCard({ c }: { c: Competitor }) {
  const priceFrom = c.site?.priceFrom || c.aiBuilder?.priceFromText;
  return (
    <div className="konk-comp-card">
      <div className="konk-comp-head">
        <a href={c.url} target="_blank" rel="noreferrer" className="cc-link konk-comp-name">{c.name}</a>
        {c.city && <span className="konk-dim konk-comp-city">{c.city}</span>}
      </div>
      {c.positioning && <p className="konk-comp-positioning">{c.positioning}</p>}
      <div className="konk-comp-stats">
        <span>{c.google ? <>{c.google.rating.toLocaleString("da-DK", { maximumFractionDigits: 1 })} ★ <span className="konk-dim">· {c.google.reviews.toLocaleString("da-DK")} anm.</span></> : <span className="konk-dim">Ingen Google-data</span>}</span>
        <span className="konk-dim">Pris fra {priceFrom || "—"}</span>
      </div>
      {c.messaging && c.messaging.angles.length > 0 && (
        <div className="konk-comp-chips">
          {c.messaging.angles.map((a) => <span key={a} className="cc-chip konk-angle-chip">{ANGLE_LABEL[a]}</span>)}
        </div>
      )}
      {c.uniqueServices && c.uniqueServices.length > 0 && (
        <div className="konk-comp-unique">
          <span className="konk-comp-unique-label">Gør det vi ikke gør</span>
          <div className="konk-comp-chips">
            {c.uniqueServices.map((s) => <span key={s} className="cc-chip konk-unique-chip">{s}</span>)}
          </div>
        </div>
      )}
      <div className="konk-comp-flags">
        <Flag on={c.seoExtra?.faqVisible} label="FAQ synlig" />
        <Flag on={c.seoExtra?.reviewsAsText} label="Kundecitater" />
        <Flag on={c.geoExtra?.citableAnswers} label="Citerbare svar" />
        <Flag on={c.site?.schemaLocalBusiness} label="Schema" />
      </div>
      <div className="konk-comp-ads">
        <a href={fbAdsUrl(c.name)} target="_blank" rel="noopener noreferrer" className="cc-btn konk-ad-btn">Se Facebook-annoncer</a>
        <a href={googleAdsUrl(c.url)} target="_blank" rel="noopener noreferrer" className="cc-btn konk-ad-btn">Se Google-annoncer</a>
      </div>
    </div>
  );
}

function SavedIdeaRow({ idea, onGone }: { idea: SavedIdea; onGone: (id: string) => void }) {
  const [busy, setBusy] = useState<"blog" | "done" | null>(null);
  const isAd = idea.title.startsWith("Annonce-idé: ");
  const label = isAd ? "Annonce-idé" : "Idé";
  const rest = idea.title.replace(/^(Annonce-idé|Idé): /, "");

  async function toBlog() {
    setBusy("blog");
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: rest.slice(0, 60), category: isAd ? undefined : "kinly" }),
      });
    } finally {
      setBusy(null);
    }
  }
  async function complete() {
    setBusy("done");
    try {
      await fetch(`/api/opgaver/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      onGone(idea.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="konk-saved-row">
      <span className="cc-chip konk-saved-chip" data-ad={isAd}>{label}</span>
      <span className="konk-saved-title">{rest}</span>
      <div className="konk-saved-actions">
        <button type="button" className="cc-btn" disabled={busy === "blog"} onClick={toBlog}>{busy === "blog" ? "…" : "→ Blog-idé"}</button>
        <button type="button" className="cc-btn cc-btn-accent" disabled={busy === "done"} onClick={complete}>{busy === "done" ? "…" : "Klaret"}</button>
      </div>
    </div>
  );
}

export default function KonkurrenterBoard({
  report,
  kinly,
  savedIdeas,
}: {
  report: CompetitorReport | null;
  kinly: KinlyRow;
  savedIdeas: SavedIdea[];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [activeCats, setActiveCats] = useState<Set<FindingCategory>>(new Set());
  const [ideas, setIdeas] = useState(savedIdeas);

  useEffect(() => {
    // localStorage findes kun client-side; siden SSR'es (i modsætning til
    // CommandPalette, der først mountes ved åbning) ville en lazy useState()-
    // initializer mismatche mellem server- og klient-render. Én effekt der
    // synker den rigtige værdi ind lige efter mount er den kendte løsning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(loadDismissed());
  }, []);

  function handleDismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistDismissed(next);
      return next;
    });
  }
  function toggleCat(cat: FindingCategory) {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }
  function removeIdea(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }

  const allFindings = useMemo<DisplayFinding[]>(() => {
    if (!report) return [];
    return [...(report.findings ?? []), ...gapsToFindings(report.gaps)];
  }, [report]);

  const visibleFindings = useMemo(
    () => allFindings.filter((f) => !dismissed.has(f.id) && (activeCats.size === 0 || activeCats.has(f.category))),
    [allFindings, dismissed, activeCats],
  );

  const kindGroups = useMemo(() => {
    const groups: Record<CompetitorKind, Competitor[]> = { bureau: [], freelancer: [], "ai-bygger": [] };
    for (const c of report?.competitors ?? []) groups[c.kind ?? "bureau"].push(c);
    return groups;
  }, [report]);

  if (!report) {
    return (
      <div className="cc-card">
        <div className="cc-empty">
          <Icon name="Radar" />
          <div>Første scanning kører søndag kl. 03.</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>Hermes&apos; ugentlige Jev-scan fylder siden herefter automatisk.</div>
        </div>
      </div>
    );
  }

  const weekPoints = (report.analysis?.points ?? []).slice(0, 3);

  return (
    <div className="konk-page">
      {/* 1. Statuslinje */}
      <div className="konk-summary">
        <div className="konk-summary-stat">
          <span className="konk-summary-label">Seneste scan</span>
          <span className="konk-summary-value">{fmtDate(report.generatedAt)}</span>
        </div>
        {KIND_ORDER.map((k) => (
          <div className="konk-summary-stat" key={k}>
            <span className="konk-summary-label">{KIND_LABEL[k]}</span>
            <span className="konk-summary-value">{kindGroups[k].length}</span>
          </div>
        ))}
      </div>

      {/* 2. Denne uge */}
      {weekPoints.length > 0 && (
        <section className="konk-section">
          <h2 className="konk-section-title">Denne uge</h2>
          <div className="konk-dim" style={{ fontSize: 12, marginBottom: 4 }}>
            AI-læsning af Jevs tal ({report.analysis!.model}, {fmtDate(report.analysis!.at)}). Tjek tallene i tabellen, før du handler på det.
          </div>
          <div className="konk-week-grid">
            {weekPoints.map((p, i) => (
              <FindingCard
                key={`week-${i}`}
                big
                f={{
                  id: `week-${i}`,
                  category: p.category ?? "forbedring",
                  title: p.title,
                  detail: p.detail,
                  evidence: [],
                  suggest: p.suggest ?? "blog",
                }}
                onDismiss={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      {/* 3. Handlingskø */}
      <section className="konk-section">
        <h2 className="konk-section-title">Handlingskø</h2>
        <div className="konk-filter-row">
          {(Object.keys(CATEGORY_CHIP_LABEL) as FindingCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              className="konk-filter-chip"
              data-on={activeCats.has(cat)}
              onClick={() => toggleCat(cat)}
            >
              {CATEGORY_CHIP_LABEL[cat]}
            </button>
          ))}
        </div>
        {visibleFindings.length === 0 ? (
          <div className="cc-card">
            <div className="cc-empty">
              <Icon name="CheckCheck" />
              <div>{allFindings.length === 0 ? "Ingen fund endnu." : "Intet matcher filtret — eller alt er afvist/klaret."}</div>
            </div>
          </div>
        ) : (
          <div className="konk-finding-grid">
            {visibleFindings.map((f) => (
              <FindingCard key={f.id} f={f} onDismiss={handleDismiss} />
            ))}
          </div>
        )}
      </section>

      {/* 5. Gemte idéer */}
      <section className="konk-section">
        <h2 className="konk-section-title">Gemte idéer</h2>
        {ideas.length === 0 ? (
          <div className="konk-dim" style={{ fontSize: 12.5 }}>Ingen gemte idéer endnu — brug &quot;Gem til senere&quot; på et fund ovenfor.</div>
        ) : (
          <div className="konk-saved-list">
            {ideas.map((idea) => <SavedIdeaRow key={idea.id} idea={idea} onGone={removeIdea} />)}
          </div>
        )}
      </section>

      {/* 6. Konkurrenter */}
      <section className="konk-section">
        <h2 className="konk-section-title">Konkurrenter</h2>
        <div className="konk-comp-grid">
          <div className="konk-comp-card konk-comp-kinly">
            <div className="konk-comp-head">
              <span className="cc-chip konk-us-chip">Os</span>
              <strong>{kinly.name}</strong>
            </div>
            <p className="konk-comp-positioning">{kinly.positioning}</p>
            <div className="konk-comp-stats">
              <span className="konk-dim">{kinly.services.join(", ")}</span>
              <span className="konk-dim">{kinly.blogPosts30d} blogindlæg / 30 dage</span>
            </div>
          </div>
        </div>
        {KIND_ORDER.filter((k) => kindGroups[k].length > 0).map((k) => (
          <div key={k} className="konk-comp-kind-group">
            <h3 className="konk-comp-kind-title">{KIND_LABEL[k]}</h3>
            <div className="konk-comp-grid">
              {kindGroups[k].map((c) => <CompetitorCard key={c.url} c={c} />)}
            </div>
          </div>
        ))}
      </section>

      {/* 7. Mønstre */}
      {report.patterns.length > 0 && (
        <details className="konk-patterns-details">
          <summary className="konk-section-title konk-patterns-summary">Mønstre der virker</summary>
          <div className="konk-pattern-grid">
            {report.patterns.map((p, i) => <PatternCard key={i} pattern={p} />)}
          </div>
        </details>
      )}
    </div>
  );
}
