// mail-decode.ts — turn a raw RFC822 message source into clean, readable plain
// text. The live inbox fallback used to show raw quoted-printable ("=E6" instead
// of "æ", soft "=\n" line breaks, MIME boundaries), which made replies unreadable.
//
// Pure + dependency-free (uses TextDecoder, available in Node 18+ and the edge
// runtime). Handles: multipart → pick text/plain (fallback text/html → strip
// tags), Content-Transfer-Encoding quoted-printable / base64, and the common
// charsets (utf-8, windows-1252, iso-8859-1). Best-effort: never throws.

function normalizeCharset(cs: string | undefined): string {
  const c = (cs || "utf-8").trim().toLowerCase().replace(/["']/g, "");
  if (c === "us-ascii" || c === "ascii") return "utf-8";
  if (c === "latin1" || c === "iso8859-1") return "iso-8859-1";
  return c;
}

function decodeBytes(bytes: Uint8Array, charset?: string): string {
  try {
    return new TextDecoder(normalizeCharset(charset)).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return String.fromCharCode(...bytes);
    }
  }
}

/** Decode a quoted-printable string into text using the given charset. */
export function decodeQuotedPrintable(input: string, charset?: string): string {
  // Soft line breaks: "=" at end of line.
  const s = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) {
      bytes.push(parseInt(s.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return decodeBytes(Uint8Array.from(bytes), charset);
}

function decodeBase64(input: string, charset?: string): string {
  try {
    const clean = input.replace(/[^A-Za-z0-9+/=]/g, "");
    const bytes = Uint8Array.from(Buffer.from(clean, "base64"));
    return decodeBytes(bytes, charset);
  } catch {
    return input;
  }
}

/** Fjern hele elementer hvis åbne-tag matcher `open` — balanceret over indlejrede `tag`; ulukket → resten fjernes. */
function removeBlocks(html: string, open: RegExp, tag: string): string {
  let s = html;
  for (let m = s.match(open); m?.index !== undefined; m = s.match(open)) {
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    re.lastIndex = m.index;
    let depth = 0;
    let end = s.length;
    for (let t = re.exec(s); t; t = re.exec(s)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    s = s.slice(0, m.index) + s.slice(end);
  }
  return s;
}

/** Fjern citeret historik, men bevar ny tekst før OG efter et citat (Astra 9/10): Gmails gmail_quote/gmail_attr-div og
 *  blockquote fjernes som hele blokke (også indlejrede/ulukkede); Outlooks original står uciteret efter
 *  divRplyFwdMsg/appendonsend og klippes til slutningen. */
function stripQuotedHtml(html: string): string {
  // Kommentarer/style/script først: tags inde i dem må ikke tælle som blokke (Astra runde 6).
  // ponytail: regex-HTML, ikke en parser — loft er eksotisk/ugyldig markup; opgradér til en rigtig parser hvis det rammer.
  const s = html
    .replace(/<!--\[if[^\]]*\]>(<!-->)?|(<!--)?<!\[endif\]-->/gi, "") // MSO-betinget indhold er synlig tekst (Astra runde 7)
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/<(style|script)\b[\s\S]*?(<\/\1\s*>|$)/gi, "")
    .replace(/<div[^>]*id="(divRplyFwdMsg|appendonsend)"[\s\S]*$/i, "");
  return removeBlocks(removeBlocks(s, /<div\b[^>]*class="[^"]*\bgmail_(quote|attr)\b[^"]*"[^>]*>/i, "div"),
    /<blockquote\b[^>]*>/i, "blockquote");
}

function stripHtml(html: string): string {
  return stripQuotedHtml(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function headerValue(headers: string, name: string): string {
  const m = headers.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?:\\r?\\n[^\\s]|$)`, "im"));
  return m ? m[1].replace(/\r?\n\s+/g, " ").trim() : "";
}

function charsetOf(headers: string): string | undefined {
  const m = headers.match(/charset="?([^";\r\n]+)"?/i);
  return m ? m[1] : undefined;
}

function decodePart(headers: string, body: string): string {
  const cte = headerValue(headers, "Content-Transfer-Encoding").toLowerCase();
  const cs = charsetOf(headers);
  let text: string;
  if (cte.includes("quoted-printable")) text = decodeQuotedPrintable(body, cs);
  else if (cte.includes("base64")) text = decodeBase64(body, cs);
  else text = body;
  if (/Content-Type:\s*text\/html/i.test(headers)) text = stripHtml(text);
  return text;
}

/** Split a raw message at the first blank line → [headers, body]. */
function splitHeaders(raw: string): [string, string] {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx < 0) return [raw, ""];
  const sep = raw.slice(idx).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
  return [raw.slice(0, idx), raw.slice(idx + sep)];
}

/** Strip quoted reply history + collapse whitespace so the preview is the new text.
 *  ponytail: i plain text stopper vi ved "On … wrote:"/"Den … skrev:" — et svar skrevet INDE i citatet (efter headeren)
 *  tælles ikke; uciterede citater efter headeren ville ellers give falsk afmelding. HTML-svar håndterer begge (stripQuotedHtml). */
export function cleanupBody(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;                       // quoted
    if (/^\s*(On .+wrote:|Den .+skrev:|-{2,}\s*Original)/i.test(line)) break; // reply header
    if (/^\s*(From|Fra|Sent|Sendt|To|Til|Subject|Emne):/i.test(line) && kept.length > 3) break;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Første text/plain (ellers text/html) i et evt. indlejret multipart (mixed/related > alternative); vedhæftede filer
 *  springes over (Opus 9/10: svar med bilag, iOS-foto og Outlook-logo blev før slet ikke dekodet). */
function findText(headers: string, body: string, depth = 0): { plain?: string; html?: string } {
  if (/Content-Disposition:\s*attachment/i.test(headers)) return {};
  const boundary = headers.match(/boundary="?([^";\r\n]+)"?/i)?.[1];
  if (/Content-Type:\s*multipart/i.test(headers) && boundary) {
    if (depth >= 5) return {};
    const out: { plain?: string; html?: string } = {};
    for (const part of body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\\r?\\n?`))) {
      const [h, b] = splitHeaders(part);
      const r = findText(h, b, depth + 1);
      out.plain ??= r.plain;
      out.html ??= r.html;
      if (out.plain) break;
    }
    return out;
  }
  if (/Content-Type:\s*text\/plain/i.test(headers)) return { plain: decodePart(headers, body) };
  if (/Content-Type:\s*text\/html/i.test(headers)) return { html: decodePart(headers, body) };
  return {};
}

/** Raw RFC822 source → clean readable plain text. */
export function decodeMailBody(raw: string): string {
  if (!raw) return "";
  const [topHeaders, topBody] = splitHeaders(raw);
  if (/Content-Type:\s*multipart/i.test(topHeaders)) {
    const { plain, html } = findText(topHeaders, topBody);
    const text = plain ?? html;
    if (text) return cleanupBody(text);
  }
  // Single part.
  return cleanupBody(decodePart(topHeaders, topBody));
}
