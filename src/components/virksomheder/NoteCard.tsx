"use client";
import { useState, Fragment, type ReactNode } from "react";

// Lille, sikker markdown-lite renderer til vault-noter: overskrifter, afsnit,
// lister. Ingen dangerouslySetInnerHTML — bygger React-noder direkte.
function renderBody(body: string): ReactNode[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  function flushPara() {
    if (para.length) { blocks.push(<p key={key++}>{para.join(" ")}</p>); para = []; }
  }
  function flushList() {
    if (list.length) { blocks.push(<ul key={key++}>{list.map((li, i) => <li key={i}>{li}</li>)}</ul>); list = []; }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const heading = /^#{1,6}\s+(.*)/.exec(line);
    if (heading) { flushPara(); flushList(); blocks.push(<h3 key={key++}>{heading[1]}</h3>); continue; }
    const item = /^[-*]\s+(.*)/.exec(line);
    if (item) { flushPara(); list.push(item[1]); continue; }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

const FOLD_HEIGHT = 220;

export default function NoteCard({ title, body }: { title: string; body: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = body.length > 600;
  return (
    <div className="virk-note">
      <div className="virk-note-title">{title}</div>
      <div className="virk-note-body" style={!expanded && long ? { maxHeight: FOLD_HEIGHT, position: "relative" } : undefined}>
        {renderBody(body).map((node, i) => <Fragment key={i}>{node}</Fragment>)}
      </div>
      {long && (
        <button className="cc-link virk-btn-press" style={{ width: "fit-content", background: "none", border: "none", padding: 0, fontSize: 12.5 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Vis mindre" : "Vis mere"}
        </button>
      )}
    </div>
  );
}
