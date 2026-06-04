import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shell/PageHeader";
import MarkdownLite from "@/components/shell/MarkdownLite";
import Icon from "@/components/shell/Icon";
import ClientSeoWidget from "./ClientSeoWidget";
import { getClients } from "@/lib/sheets";
import { readVaultNote } from "@/lib/vault";
import { clientNoteRel } from "@/lib/client-notes";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Klient ${id} · Command Center` };
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let client;
  try {
    const clients = await getClients();
    client = clients.find((c) => c.id === id);
  } catch {
    client = undefined;
  }
  if (!client) notFound();

  const note = await readVaultNote(clientNoteRel(client.name).replace(/\.md$/, ""));
  const fm = note.ok ? note.frontmatter : {};
  const domain = fm.domain || "";

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Briefcase"
        title={client.name}
        subtitle={`${client.branch} · ${client.websiteStatus}`}
        action={<Link href="/clients" className="cc-btn">← Klienter</Link>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }} className="cc-client-grid">
        <Deliverable icon="FileText" title="Aftale">
          <Row k="Setup" v={client.setupFee ? `${client.setupFee} kr` : "—"} />
          <Row k="Pr. måned" v={client.monthlyFee ? `${client.monthlyFee} kr` : "—"} />
          <Row k="Brief" v={client.briefFilled ? "udfyldt" : "mangler"} />
          <Link href={`/clients/${id}/brief`} className="cc-link" style={{ fontSize: 12.5, marginTop: 4, display: "inline-block" }}>Åbn brief →</Link>
        </Deliverable>

        <Deliverable icon="LayoutGrid" title="Redigér (CMS)">
          {fm.cms_url ? (
            <a href={fm.cms_url} target="_blank" rel="noopener noreferrer" className="cc-btn" style={{ width: "fit-content" }}>Åbn CMS-admin ↗</a>
          ) : (
            <span className="cc-dim" style={{ fontSize: 13 }}>Ingen <code>cms_url</code> i vault-noten endnu. Tilføj den i {note.pathRel}.</span>
          )}
        </Deliverable>

        <Deliverable icon="Map" title="Projektmappe">
          {client.projectFolder ? (
            <a href={client.projectFolder} target="_blank" rel="noopener noreferrer" className="cc-link" style={{ fontSize: 13, wordBreak: "break-all" }}>{client.projectFolder} ↗</a>
          ) : (
            <span className="cc-dim" style={{ fontSize: 13 }}>Ingen mappe registreret.</span>
          )}
          {fm.project_url && fm.project_url !== client.projectFolder && (
            <a href={fm.project_url} target="_blank" rel="noopener noreferrer" className="cc-link" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{fm.project_url} ↗</a>
          )}
        </Deliverable>

        <Deliverable icon="Clock" title="Næste vedligehold">
          <span style={{ fontSize: 14, fontWeight: fm.naeste_vedligehold ? 600 : 400, color: fm.naeste_vedligehold ? "var(--text)" : "var(--text-dim)" }}>
            {fm.naeste_vedligehold || "Ikke planlagt — sæt naeste_vedligehold i vault-noten."}
          </span>
        </Deliverable>
      </div>

      <div style={{ marginTop: 16 }}>
        <ClientSeoWidget name={client.name} domain={domain} />
      </div>

      <section className="cc-card cc-card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <Icon name="Brain" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Vault-note</h2>
          <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 12 }}>{note.ok ? `${note.source} · ${note.pathRel}` : "ikke oprettet endnu"}</span>
        </div>
        {note.ok ? (
          <MarkdownLite source={note.body} />
        ) : (
          <p className="cc-dim" style={{ fontSize: 13 }}>
            Noten oprettes automatisk når et lead bliver til klient. Den kan også laves manuelt i KnowledgeOS/{note.pathRel}.
          </p>
        )}
      </section>

      <style>{`@media (max-width:760px){ .cc-client-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

function Deliverable({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={icon} style={{ width: 16, height: 16, color: "var(--accent-ink)" }} />
        <h3 style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
      <span className="cc-dim">{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}
