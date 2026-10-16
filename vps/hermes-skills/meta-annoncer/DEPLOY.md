# Deploy: annonce-tests til Hermes' marketing-profil

**Kør først, når HQ-branchen `feat/marketing-v2` er merget og live, og Lucas har sagt ja.** Før det svarer `/api/agent/annoncer` 404 i prod.

1. Script (no_agent, 0 LLM-tokens):
   ```bash
   scp vps/hermes-scripts/annonce_tests.py root@<vps>:/root/.hermes/scripts/
   ssh root@<vps> 'cd /root/.hermes/scripts && python3 annonce_tests.py --selftest && python3 annonce_tests.py --vis'
   ```
   `--vis` skal svare med tal eller "intet at gøre". 401 = forkert HERMES_API_SECRET; 404 = HQ ikke live.
2. Skill i marketing-profilen (tjek profilnavnet med `ls /root/.hermes/profiles/` først):
   ```bash
   scp -r vps/hermes-skills/meta-annoncer root@<vps>:/root/.hermes/profiles/<marketing>/skills/
   ```
3. Cron, via kanalen (aldrig direkte i jobs.json): dagligt 08:30, no_agent, leverer til marketing-botten.
   ```bash
   bash /root/.hermes/scripts/nyt-cronjob.sh "30 8 * * *" "annonce-tests" "no_agent: python3 /root/.hermes/scripts/annonce_tests.py"
   ```
   Tjek `nyt-cronjob.sh --help` for no_agent-syntaksen, før du kører den. Tom stdout = ingen besked (signal-porten).

Scriptet læser kun. Det kan ikke se Meta og ændrer intet i HQ.
