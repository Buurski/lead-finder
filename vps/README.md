# hermes-api — VPS-shim til Hermes Agent

Lille HTTP-API foran Hermes Agent CLI'en på Contabo VPS'en (13.140.168.144),
så websitet (/hermes) kan chatte med Buur Agent og se/køre cron jobs.

## Hvad kører hvor

| Ting | Sted |
|---|---|
| Shim | `/opt/hermes-api/hermes_api.py` (denne mappes `hermes_api.py`) |
| Service | `systemd: hermes-api` (enabled, port 8787) |
| Secret | `/etc/hermes-api.env` → `HERMES_API_SECRET` (chmod 600) |
| Hermes gateway | `systemd: hermes-gateway` (Telegram, installeret 2026-06-11 — kørte før manuelt og ville dø ved reboot) |

## Endpoints (alle HMAC-signerede)

- `GET  /api/health` — `{ok, gateway_running, cron_jobs}`
- `POST /api/chat` — `{message, profile: default|lucas|charlie, session_id}` → synkront svar
- `GET  /api/cron` — jobs fra `~/.hermes/cron/jobs.json`
- `POST /api/cron/action` — `{id, action: run|pause|resume}`

Auth: `X-Timestamp` (unix-sekunder) + `Authorization: Bearer hex(hmac_sha256(secret, "{ts}.{METHOD}.{path}.{body}"))`. 5 min skew, 30 req/min.

## Env til websitet (lokalt + Vercel)

```
HERMES_API_URL=http://13.140.168.144:8787
HERMES_API_SECRET=<hent med: ssh hermes-vps "grep HERMES_API_SECRET /etc/hermes-api.env">
```

Sæt begge i `.env.local` (lokalt) og i Vercel-projektets env (production).
Uden dem viser /hermes pænt "ikke konfigureret".

## Genudrul shim efter ændringer

```bash
scp vps/hermes_api.py hermes-vps:/opt/hermes-api/hermes_api.py
ssh hermes-vps "systemctl restart hermes-api"
```

## Hærdning 2026-06-11 (aften, council-review)

- Rate limit er nu **per chat-profil** (før: globalt 30/min — Lucas og Charlie
  kunne blokere hinanden).
- Session-locks bruger **LRU-eviction** (før: `clear()` ved 500, som smed
  aktive locks ud og åbnede for parallelle CLI-kørsler på samme session).

## Fixes lavet 2026-06-11

1. **Dreaming-cron fejlede 02:00 med 401** — gateway-processen var startet manuelt
   med gammelt miljø (før minimax-nøglen kom i `~/.hermes/.env`). Gateway kører nu
   som systemd-service med frisk env.
2. **lucas/charlie-profiler havde ingen modelnøgler** (`.env: not configured`) —
   `~/.hermes/profiles/{lucas,charlie}/.env` er nu symlinks til `~/.hermes/.env`.
3. **Web-kanal** tilføjet til `~/.hermes/AGENTS.md`, så Hermes ved beskeder også
   kommer fra websitet (sessions hedder `web-<id>`).

## Kendt begrænsning

Trafikken er HTTP (ikke TLS) — HMAC beskytter mod misbrug, men indholdet er
ukrypteret undervejs. Næste skridt hvis det skal strammes: Caddy + et subdomæne
(fx hermes.buurweb.dk) med Let's Encrypt.
