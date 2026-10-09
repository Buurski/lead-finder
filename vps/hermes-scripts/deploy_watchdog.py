#!/usr/bin/env python3
"""Deploy-watchdog for Kinlys Vercel-projekter (watchdog-mønster).

Tjekker for hvert projekt:
1. Nyeste PRODUKTIONS-deployment (READY / ERROR / BUILDING)
2. Alias (produktionsdomæne) peger på nyeste promoverede produktions-deployment

Udskriver KUN ved problemer (tom stdout = stilhed → cron leverer intet).
Kan bruges som no_agent-script eller monitor_script.

Installeres på VPS som /root/.hermes/scripts/deploy_watchdog.py (kopi af denne fil).
Test: python3 test_deploy_watchdog.py

Rettet 9/10-2026 (GN6): `/v6/deployments?project=<navn>` ignoreres af Vercel
(parameteren hedder projectId), så alias blev sammenlignet med alle projekters
produktions-deploys. kinly.dk gav falsk "164 t bagud" hver morgen i 6 dage.
Nu: navn -> projectId via /v9/projects, kun target=production og kun
promoverede deployments (ikke previews, Dependabot eller staged).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

# lead-finder = HQ (alias verificeret mod Vercel 9/10-2026; "lead-system" findes ikke som projekt).
# buur-cms er fjernet: der findes intet Vercel-projekt med det navn (kinly-cms/buur-cms-* er kunde-CMS).
PROJECTS = [
    {"name": "kinly-site", "aliases": ["kinly.dk"]},
    {"name": "lead-finder", "aliases": ["lead-finder-three-beta.vercel.app"]},
]

STALE_MS = 48 * 3600 * 1000


def api(path: str, token: str) -> dict:
    request = urllib.request.Request(
        f"https://api.vercel.com{path}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def is_live_production(d: dict) -> bool:
    """Produktions-deployment der faktisk er (eller har været) promoveret.
    Preview = target ikke 'production'; Dependabot/staged = READY men ikke PROMOTED."""
    if d.get("target") != "production":
        return False
    if d.get("readyState") == "READY":
        return d.get("readySubstate") == "PROMOTED"
    return True  # ERROR / BUILDING på produktion skal stadig kunne alarmere


def latest_deployments(project_id: str, token: str, api=api) -> list[dict]:
    data = api(f"/v6/deployments?projectId={project_id}&limit=30&target=production&state=READY,ERROR,BUILDING", token)
    return [d for d in data.get("deployments", []) if is_live_production(d)]


def check_project(project: dict, token: str, api=api) -> list[str]:
    problems: list[str] = []
    name = project["name"]

    # 1. Projektnavn -> id, og nyeste produktions-deployments for DET projekt
    try:
        project_id = api(f"/v9/projects/{name}", token)["id"]
        deploys = latest_deployments(project_id, token, api)
    except Exception as e:  # noqa: BLE001
        return [f"{name}: kunne ikke hente deployments ({type(e).__name__})"]

    if not deploys:
        return [f"{name}: ingen produktions-deployments fundet"]

    latest = deploys[0]
    state = latest.get("readyState", "ukendt")
    if state in ("ERROR", "CANCELED"):
        problems.append(
            f"{name}: nyeste produktions-deployment er {state} "
            f"({latest.get('meta', {}).get('githubCommitSha', '')[:7] or 'ukendt sha'})"
        )

    # 2. Alias peger på nyeste READY produktions-deployment?
    for alias in project["aliases"]:
        try:
            alias_data = api(f"/v4/aliases/{alias}", token)
        except Exception:  # noqa: BLE001
            problems.append(f"{name}: kunne ikke læse alias {alias}")
            continue
        live_id = alias_data.get("deploymentId")
        ready = [d for d in deploys if d.get("readyState") == "READY"]
        ready_ids = {d["uid"] for d in ready}
        if live_id and ready_ids and live_id not in ready_ids:
            # Alias-målet er ikke blandt projektets seneste produktions-deploys. Normalt =
            # manuelt rollback / bevidst fastholdt; alarm KUN hvis nyeste READY er markant
            # nyere end aliaset, dvs. der ligger nye ændringer klar som IKKE er rullet ud.
            newest_ready = max((d.get("createdAt", 0) for d in ready), default=0)
            try:
                target_created = int(api(f"/v6/deployments/{live_id}", token).get("createdAt") or 0)
            except Exception:  # noqa: BLE001
                target_created = 0
            if newest_ready - target_created > STALE_MS:
                age_h = max(0, (newest_ready - target_created) // 3600000)
                problems.append(
                    f"{name}: {alias} viser en deployment fra "
                    f"{age_h} t før den nyeste — nyere kode er bygget grøn men IKKE rullet ud"
                )

    return problems


def main() -> int:
    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        # Cron-miljøer har ikke vores env — source credentials selv (watchdog
        # fejlede 2026-08-22 med "VERCEL_TOKEN mangler").
        try:
            for line in open("/root/.hermes/credentials.env"):
                line = line.strip()
                if line.startswith("VERCEL_TOKEN=") and not line.startswith("VERCEL_TOKEN=***"):
                    token = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        except OSError:
            pass
    if not token:
        print("Deploy-watchdog: VERCEL_TOKEN mangler")
        return 1

    all_problems: list[str] = []
    for project in PROJECTS:
        all_problems.extend(check_project(project, token))

    if not all_problems:
        return 0  # stilhed — alt er grønt

    print("DEPLOY-WATCHDOG:")
    for problem in all_problems:
        print(f"  ⚠ {problem}")
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        print(f"DEPLOY-WATCHDOG FEJL (undtagelse): {type(e).__name__}: {e}")
        sys.exit(1)
