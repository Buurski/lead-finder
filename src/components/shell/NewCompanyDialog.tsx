"use client";
// "Ny virksomhed"-dialog ("+ Ny"): opretter en virksomhed/lead manuelt
// (POST /api/virksomheder) og sender videre til dens profil.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import "./quick-actions.css";

export default function NewCompanyDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("Navn mangler"); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/virksomheder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, city: city.trim(), phone: phone.trim(), email: email.trim(), website: website.trim() }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string; id?: string });
      if (!res.ok) throw new Error((data as { error?: string }).error || "kunne ikke oprette virksomheden");
      router.push(`/virksomheder/${(data as { id: string }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "kunne ikke oprette virksomheden");
      setSaving(false);
    }
  }

  return (
    <div className="qa-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="qa-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-company-title" onSubmit={submit}>
        <div className="qa-dialog-head">
          <h2 id="qa-company-title">Ny virksomhed</h2>
          <button type="button" className="qa-close-btn cc-focus" onClick={onClose} aria-label="Luk">
            <Icon name="X" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div className="qa-field">
          <label htmlFor="qa-co-name">Navn</label>
          <input id="qa-co-name" ref={nameRef} className="qa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx KT VVS" />
        </div>
        <div className="qa-field-row">
          <div className="qa-field">
            <label htmlFor="qa-co-city">By</label>
            <input id="qa-co-city" className="qa-input" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="qa-field">
            <label htmlFor="qa-co-phone">Telefon</label>
            <input id="qa-co-phone" className="qa-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="qa-field-row">
          <div className="qa-field">
            <label htmlFor="qa-co-email">Mail</label>
            <input id="qa-co-email" className="qa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="qa-field">
            <label htmlFor="qa-co-website">Website</label>
            <input id="qa-co-website" className="qa-input" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        </div>

        {error && <p className="qa-error">{error}</p>}

        <div className="qa-dialog-actions">
          <button type="button" className="cc-btn cc-focus" onClick={onClose}>Annuller</button>
          <button type="submit" className="cc-btn cc-btn-accent cc-focus" disabled={saving}>{saving ? "Opretter…" : "Opret virksomhed"}</button>
        </div>
      </form>
    </div>
  );
}
