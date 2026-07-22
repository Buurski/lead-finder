import PageHeader from "@/components/shell/PageHeader";

export const metadata = { title: "Hermes WebUI · Command Center" };
export const dynamic = "force-dynamic";

const WEBUI_URL = "https://number-producers-investigations-galleries.trycloudflare.com";
const WEBUI_PASSWORD = "Kinly1234";

export default function HermesWebUIPage() {
  return (
    <div
      className="cc-fade"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
      }}
    >
      <PageHeader
        icon="Sparkles"
        title="Hermes WebUI"
        subtitle="Fuld Hermes-agent i browseren — 1:1 med CLI. Login: Kinly1234."
        action={
          <a
            href={WEBUI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="cc-chip"
            style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
          >
            Åbn i nyt vindue ↗
          </a>
        }
      />

      <div
        style={{
          flex: 1,
          margin: "12px 0 24px",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          background: "#0d0e1a",
          boxShadow: "0 1px 0 var(--border) inset",
          minHeight: 600,
        }}
      >
        <iframe
          src={WEBUI_URL}
          title="Hermes WebUI"
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
            minHeight: 600,
          }}
          allow="clipboard-read; clipboard-write; microphone; camera"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        />
      </div>
    </div>
  );
}