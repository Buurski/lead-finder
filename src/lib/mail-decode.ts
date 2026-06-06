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

function stripHtml(html: string): string {
  return html
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

/** Strip quoted reply history + collapse whitespace so the preview is the new text. */
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

/** Raw RFC822 source → clean readable plain text. */
export function decodeMailBody(raw: string): string {
  if (!raw) return "";
  const [topHeaders, topBody] = splitHeaders(raw);

  // Multipart: find the text/plain part (fallback text/html).
  const boundaryMatch = topHeaders.match(/boundary="?([^";\r\n]+)"?/i);
  if (/Content-Type:\s*multipart/i.test(topHeaders) && boundaryMatch) {
    const parts = topBody.split(new RegExp(`--${boundaryMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\\r?\\n?`));
    let html = "";
    for (const part of parts) {
      const [h, b] = splitHeaders(part);
      if (/Content-Type:\s*text\/plain/i.test(h)) return cleanupBody(decodePart(h, b));
      if (/Content-Type:\s*text\/html/i.test(h)) html = decodePart(h, b);
    }
    if (html) return cleanupBody(html);
  }

  // Single part.
  return cleanupBody(decodePart(topHeaders, topBody));
}
