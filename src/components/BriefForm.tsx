"use client";
import { useState } from "react";
import { FolderOpen, Copy, Check, Sparkles, Loader2 } from "lucide-react";
import type { DeepResearch } from "@/app/api/leads/[id]/deep-research/route";

const FIELDS = [
  { key: "clientName",     label: "Virksomhedens navn",         placeholder: "F.eks. Lars Hansen Tømrer",            type: "text" },
  { key: "branch",         label: "Branch / håndværk",          placeholder: "F.eks. tømrer, frisør, maler...",      type: "text" },
  { key: "city",           label: "By",                         placeholder: "F.eks. Herning",                        type: "text" },
  { key: "customers",      label: "Hvem er deres kunder?",      placeholder: "F.eks. private husejere i Midtjylland", type: "text" },
  { key: "tone",           label: "Tone i 3 ord",               placeholder: "F.eks. troværdig, lokal, varm",         type: "text" },
  { key: "colorVibe",      label: "Farvestemning",              placeholder: "F.eks. varm, kølig, mørk, neutral...",  type: "text" },
  { key: "services",       label: "Hvad tilbyder de?",          placeholder: "Primære ydelser...",                    type: "textarea" },
  { key: "differentiator", label: "Hvad gør dem specielle?",   placeholder: "Hvad skiller dem fra konkurrenterne?",  type: "textarea" },
  { key: "antiReferences", label: "Sites de ikke kan lide",     placeholder: "URLs eller beskrivelser (valgfrit)",    type: "text" },
  { key: "hasLogo",        label: "Har de et logo?",            placeholder: "Ja / Nej / Under udarbejdelse",         type: "text" },
] as const;

type FieldKey = typeof FIELDS[number]["key"];
type FormData = Record<FieldKey, string>;
const EMPTY: FormData = { clientName: "", branch: "", city: "", customers: "", tone: "", colorVibe: "", services: "", differentiator: "", antiReferences: "", hasLogo: "" };

const inputStyle = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "var(--text)",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 0.15s",
};

// Fields that can be auto-filled from research
const AUTO_FILL_FIELDS: FieldKey[] = ["customers", "tone", "colorVibe", "services", "differentiator", "hasLogo"];

export default function BriefForm({
  clientId,
  leadId,
  initialValues,
  deepResearch: initialDeepResearch,
}: {
  clientId: string;
  leadId?: string;
  initialValues?: Partial<FormData>;
  deepResearch?: DeepResearch;
}) {
  const [form, setForm] = useState<FormData>({ ...EMPTY, ...initialValues });
  const [loading, setLoading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [deepResearch, setDeepResearch] = useState<DeepResearch | undefined>(initialDeepResearch);
  const [autoFilled, setAutoFilled] = useState<Set<FieldKey>>(
    () => new Set(initialDeepResearch ? AUTO_FILL_FIELDS.filter(k => !!initialValues?.[k]) : [])
  );

  function set(key: FieldKey, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
    // If user edits an auto-filled field, remove the highlight
    setAutoFilled(prev => { const s = new Set(prev); s.delete(key); return s; });
  }

  async function runDeepResearch() {
    if (!leadId) return;
    setResearching(true);
    setResearchError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/deep-research`, { method: "POST" });
      if (!res.ok) throw new Error("Fejl ved hentning");
      const data: DeepResearch = await res.json();
      setDeepResearch(data);

      // Apply auto-fill for fields that are still empty (or were previously auto-filled)
      const filled = new Set<FieldKey>();
      const ab = data.autoFilledBrief;
      const patches: Partial<FormData> = {};
      if (ab.customers)     { patches.customers     = ab.customers;     filled.add("customers"); }
      if (ab.tone)          { patches.tone          = ab.tone;          filled.add("tone"); }
      if (ab.colorVibe)     { patches.colorVibe     = ab.colorVibe;     filled.add("colorVibe"); }
      if (ab.services)      { patches.services      = ab.services;      filled.add("services"); }
      if (ab.differentiator){ patches.differentiator= ab.differentiator;filled.add("differentiator"); }
      if (ab.hasLogo)       { patches.hasLogo       = ab.hasLogo;       filled.add("hasLogo"); }

      setForm(prev => ({ ...prev, ...patches }));
      setAutoFilled(filled);
    } catch {
      setResearchError("Kunne ikke hente oplysninger. Prøv igen.");
    } finally {
      setResearching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deepResearch ? { ...form, deepResearch } : form),
      });
      if (!res.ok) throw new Error("Fejl ved oprettelse");

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const name = match?.[1] ?? `${form.clientName}-CLAUDE.md`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);

      setFileName(name);
      setDownloaded(true);
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!fileName) return;
    navigator.clipboard.writeText(fileName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (downloaded) {
    return (
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        textAlign: "center",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "#dcfce7",
          border: "1px solid #bbf7d0",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <FolderOpen size={24} style={{ color: "var(--green)" }} />
        </div>
        <div>
          <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 700, fontSize: 18, color: "var(--text)" }}>
            CLAUDE.md hentet
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Flyt filen til <code style={{ fontSize: 12 }}>~/Clients/{"{clientnavn)"}/</code> og åbn mappen i Claude Code
          </p>
        </div>
        <div style={{
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontFamily: "var(--font-fraunces), serif",
          fontSize: 12,
          color: "var(--text-muted)",
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span>
          <button onClick={copy} style={{ cursor: "pointer", flexShrink: 0 }} aria-label="Kopier filnavn">
            {copied
              ? <Check size={15} style={{ color: "var(--green)" }} />
              : <Copy size={15} style={{ color: "var(--text-dim)" }} />
            }
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-dim)", maxWidth: 360 }}>
          Brug <span style={{ color: "var(--text)", fontFamily: "var(--font-fraunces), serif" }}>huashu-design</span> eller <span style={{ color: "var(--text)", fontFamily: "var(--font-fraunces), serif" }}>impeccable</span> skill i Claude Code.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Auto-fill button */}
      {leadId && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              {deepResearch ? "Oplysninger hentet fra hjemmeside, Google & Facebook" : "Hent oplysninger automatisk"}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {deepResearch
                ? `Sidst opdateret ${new Date(deepResearch.fetchedAt).toLocaleDateString("da-DK")} — ${deepResearch.websitePages?.length ?? 0} sider analyseret`
                : "Analyserer hjemmeside, Google Maps og Facebook og udfylder felterne nedenfor"}
            </p>
            {researchError && <p style={{ fontSize: 12, color: "oklch(55% 0.18 25)", marginTop: 4 }}>{researchError}</p>}
          </div>
          <button
            type="button"
            onClick={runDeepResearch}
            disabled={researching}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              background: researching ? "var(--surface)" : "var(--text)",
              color: researching ? "var(--text-muted)" : "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "8px 14px",
              fontSize: 12, fontWeight: 600,
              cursor: researching ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              transition: "opacity 0.15s",
            }}
          >
            {researching
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Henter...</>
              : <><Sparkles size={13} /> {deepResearch ? "Opdater" : "Auto-udfyld"}</>
            }
          </button>
        </div>
      )}

      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}>
        {FIELDS.map(({ key, label, placeholder, type }) => {
          const isAutoFilled = autoFilled.has(key);
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-fraunces), serif",
                }}>
                  {label}
                </label>
                {isAutoFilled && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    background: "oklch(94% 0.04 145)",
                    color: "oklch(38% 0.12 145)",
                    border: "1px solid oklch(84% 0.07 145)",
                    borderRadius: 4, padding: "1px 6px",
                    letterSpacing: "0.04em",
                  }}>
                    AUTO
                  </span>
                )}
              </div>
              {type === "textarea" ? (
                <textarea
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={placeholder}
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "none",
                    borderColor: isAutoFilled ? "oklch(78% 0.1 145)" : undefined,
                    background: isAutoFilled ? "oklch(98% 0.012 145)" : undefined,
                  }}
                  onFocus={e => (e.target as HTMLElement).style.borderColor = "var(--border-light)"}
                  onBlur={e => (e.target as HTMLElement).style.borderColor = isAutoFilled ? "oklch(78% 0.1 145)" : "var(--border)"}
                />
              ) : (
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={placeholder}
                  style={{
                    ...inputStyle,
                    borderColor: isAutoFilled ? "oklch(78% 0.1 145)" : undefined,
                    background: isAutoFilled ? "oklch(98% 0.012 145)" : undefined,
                  }}
                  onFocus={e => (e.target as HTMLElement).style.borderColor = "var(--border-light)"}
                  onBlur={e => (e.target as HTMLElement).style.borderColor = isAutoFilled ? "oklch(78% 0.1 145)" : "var(--border)"}
                />
              )}
            </div>
          );
        })}
      </div>

      <button
        type="submit"
        disabled={loading || !form.clientName || !form.branch}
        style={{
          background: "var(--green)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "12px 0",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          opacity: (loading || !form.clientName || !form.branch) ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {loading ? "Opretter projekt..." : "Opret projekt & CLAUDE.md →"}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </form>
  );
}
