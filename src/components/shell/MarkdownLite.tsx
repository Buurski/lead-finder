import type { ReactNode } from "react";

// A deliberately tiny markdown renderer for trusted, repo-local docs (Build
// Guide, Journal, Memory). Handles headings, bullets, fenced code, blockquotes,
// horizontal rules, bold + inline code. No external dependency, no HTML
// injection: text is rendered as React children, never dangerouslySetInnerHTML.
export default function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  let table: string[] = [];
  let key = 0;

  const flushTable = () => {
    if (table.length < 2) {
      // not a real table — fall back to plain paragraphs
      table.forEach((t) => out.push(<p key={key++} style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-muted)", margin: "0 0 10px" }}>{inline(t)}</p>));
      table = [];
      return;
    }
    const rows = table.map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    const header = rows[0];
    const bodyRows = rows.slice(1).filter((r) => !r.every((c) => /^:?-+:?$/.test(c) || c === ""));
    out.push(
      <div key={key++} style={{ overflowX: "auto", margin: "8px 0 14px" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr>{header.map((h, i) => <th key={i} style={{ textAlign: "left", padding: "7px 10px", borderBottom: "1px solid var(--border-strong)", color: "var(--text)", fontWeight: 600 }}>{inline(h)}</th>)}</tr>
          </thead>
          <tbody>
            {bodyRows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ padding: "7px 10px", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>{inline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    table = [];
  };

  const flushList = () => {
    if (!list.length) return;
    out.push(
      <ul key={key++} style={{ margin: "6px 0 12px", paddingLeft: 20, display: "grid", gap: 4 }}>
        {list.map((li, i) => (
          <li key={i} style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-muted)" }}>{inline(li)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw;
    if (line.trim().startsWith("```")) {
      if (code) {
        out.push(
          <pre key={key++} style={{ background: "var(--bg-3)", borderRadius: 10, padding: "12px 14px", overflowX: "auto", fontSize: 12.5, lineHeight: 1.5, margin: "8px 0 14px" }}>
            <code>{code.join("\n")}</code>
          </pre>
        );
        code = null;
      } else {
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList();
      table.push(line.trim());
      continue;
    }
    if (table.length) flushTable();
    if (/^#{1,6}\s/.test(line)) {
      flushList();
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s/, "");
      const size = level === 1 ? 21 : level === 2 ? 17 : 15;
      out.push(
        <div key={key++} style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size, letterSpacing: "-0.02em", margin: level <= 2 ? "18px 0 8px" : "12px 0 6px" }}>
          {inline(text)}
        </div>
      );
      continue;
    }
    if (/^[-*]\s/.test(line.trim())) {
      list.push(line.trim().replace(/^[-*]\s/, ""));
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushList();
      out.push(
        <blockquote key={key++} style={{ margin: "8px 0 12px", padding: "8px 14px", borderRadius: 8, background: "var(--surface-2)", color: "var(--text-muted)", fontSize: 13.5 }}>
          {inline(line.replace(/^>\s?/, ""))}
        </blockquote>
      );
      continue;
    }
    if (/^(-{3,}|={3,})$/.test(line.trim())) {
      flushList();
      out.push(<hr key={key++} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />);
      continue;
    }
    if (line.trim() === "") {
      flushList();
      continue;
    }
    flushList();
    out.push(
      <p key={key++} style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-muted)", margin: "0 0 10px", maxWidth: "72ch" }}>
        {inline(line)}
      </p>
    );
  }
  flushList();
  flushTable();
  return <div>{out}</div>;
}

// Inline: **bold** and `code`. Order-safe split on backticks then bold.
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const segs = text.split(/(`[^`]+`)/g);
  let k = 0;
  for (const seg of segs) {
    if (seg.startsWith("`") && seg.endsWith("`")) {
      parts.push(
        <code key={k++} style={{ background: "var(--bg-3)", borderRadius: 5, padding: "1px 5px", fontSize: "0.88em" }}>
          {seg.slice(1, -1)}
        </code>
      );
    } else {
      const bold = seg.split(/(\*\*[^*]+\*\*)/g);
      for (const b of bold) {
        if (b.startsWith("**") && b.endsWith("**")) {
          parts.push(<strong key={k++} style={{ color: "var(--text)", fontWeight: 600 }}>{b.slice(2, -2)}</strong>);
        } else if (b) {
          parts.push(<span key={k++}>{b}</span>);
        }
      }
    }
  }
  return parts;
}
