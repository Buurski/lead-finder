/** Smal markdown-visning til vault-noter. Alt input escapes før formatering. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function cleanMarkdown(input: string): string {
  let text = input.replace(/\r\n?/g, "\n");
  text = text.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, "");
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => label || target);
}

function inline(input: string): string {
  let value = escapeHtml(input);
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, url: string) =>
    // url er allerede escaped af escapeHtml ovenfor (" → &quot;) — escapes ikke igen.
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  return value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export function renderMarkdown(input: string): string {
  const lines = cleanMarkdown(input).split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    if (items.length) out.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    paragraph = [];
    items = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) { flush(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) { if (paragraph.length) flush(); items.push(item[1]); continue; }
    if (items.length) flush();
    paragraph.push(line);
  }
  flush();
  return out.join("\n");
}

export function markdownSections(input: string): Array<{ title: string | null; body: string }> {
  const sections: Array<{ title: string | null; body: string }> = [];
  let title: string | null = null;
  let lines: string[] = [];
  for (const line of cleanMarkdown(input).split("\n")) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      if (lines.join("").trim()) sections.push({ title, body: lines.join("\n") });
      title = heading[1]; lines = [];
    } else lines.push(line);
  }
  if (lines.join("").trim()) sections.push({ title, body: lines.join("\n") });
  return sections;
}
