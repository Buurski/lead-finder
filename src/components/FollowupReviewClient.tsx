"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, RefreshCw } from "lucide-react";

interface FollowupLead {
  id: string;
  name: string;
  email: string;
  branch: string;
  city: string;
  emailSentAt: string;
  daysSince: number;
}

export default function FollowupReviewClient() {
  const router = useRouter();
  const [leads, setLeads] = useState<FollowupLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/email/send-followups?list=1")
      .then((r) => r.json())
      .then((data) => {
        setLeads(data.leads ?? []);
        setSelected(new Set((data.leads ?? []).map((l: FollowupLead) => l.id)));
        setLoading(false);
      });
  }, []);

  const branches = useMemo(() => Array.from(new Set(leads.map((l) => l.branch))).sort(), [leads]);
  const cities = useMemo(() => Array.from(new Set(leads.map((l) => l.city))).sort(), [leads]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter((l) => {
      if (branchFilter !== "all" && l.branch !== branchFilter) return false;
      if (cityFilter !== "all" && l.city !== cityFilter) return false;
      if (q && !l.name.toLowerCase().includes(q) && !l.email.toLowerCase().includes(q) && !l.city.toLowerCase().includes(q) && !l.branch.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, search, branchFilter, cityFilter]);

  const selectedInView = filtered.filter((l) => selected.has(l.id)).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((l) => next.add(l.id));
      return next;
    });
  }

  function deselectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((l) => next.delete(l.id));
      return next;
    });
  }

  async function send() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setSending(true);
    setResult(null);
    const res = await fetch("/api/email/send-followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: ids }),
    });
    const data = await res.json();
    setResult(`Sendt: ${data.sent} ✓  Fejlede: ${data.failed}`);
    setSending(false);
    setTimeout(() => router.push("/"), 1800);
  }

  const totalSelected = selected.size;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button
          onClick={() => router.push("/")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, padding: 0 }}
        >
          <ArrowLeft size={14} /> Tilbage
        </button>

        <span style={{ fontWeight: 700, fontSize: 16 }}>Follow-up Review</span>

        <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: "auto" }}>
          {loading ? "Henter..." : `${totalSelected} af ${leads.length} leads valgt`}
        </span>

        {result ? (
          <span style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>{result}</span>
        ) : (
          <button
            onClick={send}
            disabled={sending || totalSelected === 0 || loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: totalSelected > 0 ? "#b45309" : "var(--border)",
              color: totalSelected > 0 ? "#fff" : "var(--text-muted)",
              border: "none", borderRadius: 6, padding: "7px 14px",
              fontSize: 13, fontWeight: 600,
              cursor: totalSelected > 0 && !sending ? "pointer" : "default",
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={13} />}
            {sending ? "Sender..." : `Send til ${totalSelected} leads`}
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <input
          type="text"
          placeholder="Søg navn, email, by, branche..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "7px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
        />
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
        >
          <option value="all">Alle brancher</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
        >
          <option value="all">Alle byer</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={selectAll}
          style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontSize: 12, cursor: "pointer" }}
        >
          Vælg alle
        </button>
        <button
          onClick={deselectAll}
          style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontSize: 12, cursor: "pointer" }}
        >
          Fravælg alle
        </button>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
          Viser {filtered.length} leads ({selectedInView} valgt)
        </span>
      </div>

      {/* Table */}
      <div style={{ padding: "0 24px 40px" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Henter leads...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Ingen leads matcher filteret.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-muted)" }}>
                <th style={{ padding: "10px 8px", textAlign: "left", width: 32 }}></th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>Virksomhed</th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>Branche</th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>By</th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>Email</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Dage siden</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const allowed = selected.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => toggle(lead.id)}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background: allowed ? "transparent" : "rgba(239,68,68,0.04)",
                      opacity: allowed ? 1 : 0.55,
                    }}
                  >
                    <td style={{ padding: "10px 8px" }}>
                      <input
                        type="checkbox"
                        checked={allowed}
                        onChange={() => toggle(lead.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: "pointer", width: 15, height: 15 }}
                      />
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: 500 }}>{lead.name}</td>
                    <td style={{ padding: "10px 8px", color: "var(--text-muted)" }}>{lead.branch}</td>
                    <td style={{ padding: "10px 8px", color: "var(--text-muted)" }}>{lead.city}</td>
                    <td style={{ padding: "10px 8px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: 12 }}>{lead.email}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: lead.daysSince > 14 ? "#b45309" : "var(--text-muted)" }}>
                      {lead.daysSince}d
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      {allowed ? (
                        <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>Send</span>
                      ) : (
                        <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>Skip</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
