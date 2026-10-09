#!/usr/bin/env python3
"""Offline tests for deploy_watchdog.py — no network (Vercel API is faked).

Run: python3 test_deploy_watchdog.py

Rodaarsag (GN6, 9/10-2026): `/v6/deployments?project=<navn>` ignorerer `project`
(det hedder projectId), saa watchdog sammenlignede kinly.dk med ALLE projekters
nyeste produktions-deployments (Planuko m.fl.) = "164 t bagud" hver morgen.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deploy_watchdog as dw  # noqa: E402

H = 3600 * 1000
NOW = 1_790_000_000_000


def dep(uid, hours_ago, state="READY", target="production", sub="PROMOTED"):
    return {"uid": uid, "readyState": state, "target": target, "readySubstate": sub, "createdAt": NOW - hours_ago * H, "meta": {}}


class FakeApi:
    """Svarer som Vercel: kender kun projectId, ignorerer `project=` (som i virkeligheden)."""

    def __init__(self, deployments_by_project, alias_to, projects=None):
        self.by_project = deployments_by_project
        self.alias_to = alias_to
        self.projects = projects or {"kinly-site": "prj_kinly"}
        self.calls = []
        self.all_deps = [d for ds in deployments_by_project.values() for d in ds]

    def __call__(self, path, token):
        self.calls.append(path)
        if path.startswith("/v9/projects/"):
            name = path.rsplit("/", 1)[1]
            if name not in self.projects:
                raise RuntimeError("404")
            return {"id": self.projects[name], "name": name}
        if path.startswith("/v6/deployments?"):
            if "projectId=" in path:
                pid = path.split("projectId=")[1].split("&")[0]
                return {"deployments": self.by_project.get(pid, [])}
            return {"deployments": self.all_deps}  # ingen projektfilter = hele kontoen
        if path.startswith("/v4/aliases/"):
            return {"deploymentId": self.alias_to}
        if path.startswith("/v6/deployments/"):
            uid = path.rsplit("/", 1)[1]
            d = next(x for x in self.all_deps if x["uid"] == uid)
            return {"createdAt": d["createdAt"]}
        raise AssertionError(path)


PROJECT = {"name": "kinly-site", "aliases": ["kinly.dk"]}


class WatchdogTests(unittest.TestCase):
    def test_other_projects_production_deploys_do_not_trigger_alarm(self):
        # kinly.dk staar paa projektets egen nyeste prod. Planuko har 7 dage nyere prod-deploys.
        api = FakeApi(
            {"prj_kinly": [dep("k1", 168)], "prj_planuko": [dep("p1", 1), dep("p2", 2)]},
            alias_to="k1",
        )
        self.assertEqual(dw.check_project(PROJECT, "t", api=api), [])
        self.assertTrue(any("projectId=prj_kinly" in c for c in api.calls))
        self.assertFalse(any("project=kinly-site" in c for c in api.calls))

    def test_staged_or_preview_deploys_are_ignored_as_newest(self):
        # Dependabot/preview/staged ligger nyere end alias-maalet, men er ikke produktion.
        api = FakeApi(
            {"prj_kinly": [
                dep("prev", 1, target=None, sub="READY"),
                dep("stag", 2, target="production", sub="STAGED"),
                dep("live", 200),
            ]},
            alias_to="live",
        )
        self.assertEqual(dw.check_project(PROJECT, "t", api=api), [])

    def test_real_stale_production_still_alarms(self):
        # Alias peger paa en gammel deployment uden for de seneste produktions-deploys (fx 100 t
        # gammel), mens en nyere er promoveret >48 t efter = nyt build er ikke rullet ud.
        api = FakeApi({"prj_kinly": [dep("new", 1)], "prj_aeldre": [dep("old", 100)]}, alias_to="old")
        problems = dw.check_project(PROJECT, "t", api=api)
        self.assertEqual(len(problems), 1)
        self.assertIn("kinly.dk", problems[0])
        self.assertIn("99 t", problems[0])

    def test_error_state_of_newest_production_alarms(self):
        api = FakeApi({"prj_kinly": [dep("bad", 1, state="ERROR", sub=None), dep("live", 5)]}, alias_to="live")
        problems = dw.check_project(PROJECT, "t", api=api)
        self.assertTrue(any("ERROR" in p for p in problems))

    def test_unknown_project_is_reported_not_silently_ignored(self):
        api = FakeApi({}, alias_to="x", projects={})
        problems = dw.check_project({"name": "findes-ikke", "aliases": []}, "t", api=api)
        self.assertEqual(len(problems), 1)
        self.assertIn("findes-ikke", problems[0])


if __name__ == "__main__":
    unittest.main()
