// /seo-tjek — the public lead-magnet form. Served as a raw HTML route handler
// (same pattern as /demo/[slug]) so the internal Command Center shell never
// renders on a public page. Posts to /api/seo-tjek/submit and redirects to the
// finished report.

export const dynamic = "force-static";

const FORM_HTML = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gratis SEO-tjek af din hjemmeside | Buur Web</title>
<meta name="description" content="Få en gratis rapport om din hjemmesides synlighed på Google og i AI-søgning (ChatGPT). Tager 1 minut, leveres på mail.">
<style>
  :root{--bg:#faf8f4;--ink:#2b2620;--muted:#7a7267;--accent:#4a7c59;--border:#e6e0d6}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6}
  .wrap{max-width:560px;margin:0 auto;padding:3rem 1.25rem}
  h1{font-size:2rem;line-height:1.2;margin:.5rem 0 1rem;font-family:Georgia,serif}
  .kicker{text-transform:uppercase;letter-spacing:.1em;font-size:.72rem;color:var(--accent);font-weight:700}
  .sub{color:var(--muted);margin-bottom:2rem}
  form{background:#fff;border:1px solid var(--border);border-radius:16px;padding:1.5rem;box-shadow:0 4px 16px rgba(60,50,30,.05)}
  label{display:block;font-weight:600;font-size:.88rem;margin:1rem 0 .3rem}
  label:first-child{margin-top:0}
  input[type=url],input[type=text],input[type=email],select{width:100%;padding:.65rem .8rem;border:1px solid var(--border);border-radius:9px;font-size:1rem;background:#fff;color:var(--ink)}
  input:focus,select:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
  .row{display:flex;gap:.75rem}
  .row>div{flex:1}
  .consent{display:flex;gap:.6rem;align-items:flex-start;margin:1.2rem 0;font-size:.85rem;color:var(--muted)}
  .consent input{margin-top:.25rem}
  button{width:100%;background:var(--ink);color:#fff;border:0;padding:.85rem;border-radius:10px;font-size:1.05rem;font-weight:700;cursor:pointer}
  button:disabled{opacity:.55;cursor:wait}
  .status{margin-top:1rem;font-size:.9rem;min-height:1.4em}
  .status.err{color:#b91c1c}
  .status.ok{color:var(--accent)}
  .points{margin:0 0 2rem;padding:0;list-style:none}
  .points li{padding-left:1.4rem;position:relative;margin:.4rem 0;font-size:.95rem}
  .points li:before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}
  .foot{margin-top:2rem;font-size:.78rem;color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">
  <p class="kicker">Gratis og uforpligtende</p>
  <h1>Hvor synlig er din hjemmeside på Google og i ChatGPT?</h1>
  <p class="sub">Få en konkret rapport på 1 minut. Vi tjekker hastighed, Google-synlighed, AI-parathed og online booking, og fortæller dig de 3 vigtigste ting at fikse. På almindeligt dansk.</p>
  <ul class="points">
    <li>Hastighed på mobil og computer (Googles egne tal)</li>
    <li>Kan ChatGPT og Google AI finde og anbefale jer?</li>
    <li>Jeres placering når lokale søger efter jeres branche</li>
    <li>De 3 vigtigste ting at fikse, forklaret uden teknik-sprog</li>
  </ul>
  <form id="f">
    <label for="url">Din hjemmeside</label>
    <input id="url" name="url" type="text" inputmode="url" placeholder="dinside.dk" required>
    <label for="email">Din mail (rapporten sendes hertil)</label>
    <input id="email" name="email" type="email" placeholder="dig@firma.dk" required>
    <div class="row">
      <div>
        <label for="branch">Branche (valgfri)</label>
        <select id="branch" name="branch">
          <option value="">Vælg…</option>
          <option value="frisør">Frisør / barber</option>
          <option value="skønhedsklinik">Skønhed / klinik / negle</option>
          <option value="restaurant">Restaurant / café</option>
          <option value="håndværker">Håndværker</option>
          <option value="butik">Butik</option>
          <option value="andet">Andet</option>
        </select>
      </div>
      <div>
        <label for="city">By (valgfri)</label>
        <input id="city" name="city" type="text" placeholder="Ikast">
      </div>
    </div>
    <div class="consent">
      <input id="consent" name="consent" type="checkbox" required>
      <label for="consent" style="font-weight:400;margin:0">Ja tak, send rapporten til min mail. I må også følge op med ét godt råd om min side. Jeg kan afmelde med ét klik, og I deler aldrig min mail med andre.</label>
    </div>
    <button id="btn" type="submit">Tjek min side gratis</button>
    <p class="status" id="status" role="status"></p>
  </form>
  <p class="foot">Buur Web · Rapporten genereres automatisk med Googles PageSpeed-data og en gennemgang af din side. Ingen betaling, intet kort, ingen binding.</p>
</div>
<script>
(function () {
  var f = document.getElementById("f");
  var btn = document.getElementById("btn");
  var status = document.getElementById("status");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    btn.disabled = true;
    status.className = "status ok";
    status.textContent = "Tjekker din side. Det tager typisk 30-60 sekunder…";
    try {
      var res = await fetch("/api/seo-tjek/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: document.getElementById("url").value,
          email: document.getElementById("email").value,
          branch: document.getElementById("branch").value,
          city: document.getElementById("city").value,
          consent: document.getElementById("consent").checked,
        }),
      });
      var data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Noget gik galt. Prøv igen om lidt.");
      status.textContent = "Færdig! Åbner din rapport…";
      window.location.href = data.reportUrl;
    } catch (err) {
      status.className = "status err";
      status.textContent = err.message || "Noget gik galt. Prøv igen om lidt.";
      btn.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;

export async function GET(): Promise<Response> {
  return new Response(FORM_HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
