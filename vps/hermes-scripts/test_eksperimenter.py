#!/usr/bin/env python3
"""Offline tests for eksperimenter.py — ingen netværk (falsk HQ, falsk Jev, falsk council-trigger).

Run: python3 test_eksperimenter.py
"""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eksperimenter as ex  # noqa: E402

GOOD = {"relevans": "høj", "effekt": "høj", "indsats": "lille", "risiko": "lav", "belaeg": "stærkt"}
PLAN_JSON = '{"hypothesis":"Bynavn i title giver flere klik","change":"Skriv title om på forsiden","metric":{"type":"gsc_query","target":"webdesign herning"},"success":"Flere klik end ugen før"}'


def jev_answers(**over):
    ans = {qid: {"type": "choice", "choice": c, "confidence": 0.8} for qid, c in GOOD.items()}
    for qid, (choice, conf) in over.items():
        ans[qid] = {"type": "choice", "choice": choice, "confidence": conf}
    return {"answers": ans}


class FakeHQ:
    def __init__(self, experiments, geo_queries=(), measurements=None):
        self.experiments = experiments
        self.geo_queries = list(geo_queries)
        self.measurements = measurements or {}
        self.calls = []

    def __call__(self, payload, path=ex.PATH):
        self.calls.append((path, payload))
        a = payload.get("action")
        if path == ex.TASKS_PATH:
            return {"ok": True, "task": {"id": "t1"}}
        if a == "review":  # som HQ: reviewet gemmes på idéen
            for e in self.experiments:
                if e["id"] == payload["id"]:
                    e["review"] = payload["review"]
        if a == "list":
            return {"ok": True, "experiments": self.experiments, "geoQueries": self.geo_queries}
        if a == "measure":
            key = (payload["metric"]["type"], payload.get("start"))
            return {"ok": True, "measurement": self.measurements.get(key) or self.measurements.get(payload["metric"]["type"])}
        return {"ok": True, "experiment": {}}

    def writes(self, action=None):
        return [(p, b) for p, b in self.calls if b.get("action") not in ("list", "measure") and (action is None or b.get("action") == action)]


def runner(hq, jev=None, now="2026-09-28T05:00:00+00:00", demand=None, dry=False):
    counts = {"jev": 0, "council": 0, "states": []}

    def fake_jev(state, questions):
        counts["jev"] += 1
        counts["states"].append(state)
        assert set(questions) == {"relevans", "effekt", "indsats", "risiko", "belaeg"}
        return jev if jev is not None else jev_answers()

    def fake_trigger():
        counts["council"] += 1

    ex.trigger_council = fake_trigger  # aldrig et rigtigt subprocess i tests
    r = ex.Runner(dry_run=dry, post=hq, jev=fake_jev,
                  demand_get=demand or (lambda kw, n: {"questions": []}),
                  now=datetime.fromisoformat(now), log=lambda *_: None)
    return r, counts

def idea(**kw):
    e = {"id": "e1", "title": "Tilbyd logo-pakke", "detail": "3 bureauer i Herning gør det", "status": "vurderes",
         "source": {"kind": "ydelse", "from": "konkurrent"}}
    e.update(kw)
    return e


def tester(metric, started="2026-09-20T08:00:00Z", ends="2026-09-27T08:00:00Z", baseline=None):
    e = idea(status="tester", plan={"hypothesis": "h", "change": "c", "metric": metric, "days": 7, "success": "flere klik"},
             test={"startedAt": started, "endsAt": ends, **({"baseline": baseline} if baseline else {})})
    return e


class AssessTests(unittest.TestCase):
    def test_low_relevance_dropped_silently_without_council_or_task(self):
        hq = FakeHQ([idea()])
        r, c = runner(hq, jev=jev_answers(relevans=("lav", 0.85)))
        r.run()
        (path, body), = hq.writes()
        self.assertEqual(body["action"], "review")
        self.assertEqual(body["review"]["verdict"], "drop")
        self.assertIn("Lav relevans", body["review"]["reason"])
        self.assertEqual((c["jev"], c["council"]), (1, 0))
        self.assertFalse([w for w in hq.calls if w[0] == ex.TASKS_PATH])

    def test_good_idea_gets_one_jev_then_council_agent(self):
        hq = FakeHQ([idea()])
        r, c = runner(hq)
        r.run()
        self.assertEqual([b["action"] for _, b in hq.writes()], ["review"])  # planen skriver agenten selv
        self.assertEqual((c["jev"], c["council"]), (1, 1))
        scores = hq.writes("review")[0][1]["review"]["scores"]
        self.assertEqual([s["rating"] for s in scores], [3] * 5)  # conf 0.8 → 3
    def test_unsure_low_effect_is_not_dropped(self):
        hq = FakeHQ([idea()])
        r, _ = runner(hq, jev=jev_answers(effekt=("lav", 0.55)))
        r.run()
        rv = hq.writes("review")[0][1]["review"]
        self.assertEqual(rv["verdict"], "test")
        self.assertEqual(rv["scores"][1], {"navn": "effekt", "rating": 1, "conf": 0.55})  # usikker = ingen opbakning
        self.assertIn("usikker på effekt", rv["reason"])

    def test_weak_evidence_and_brand_risk_named_in_reason(self):
        hq = FakeHQ([idea()])
        r, _ = runner(hq, jev=jev_answers(belaeg=("svagt", 0.7), risiko=("høj", 0.9), indsats=("stor", 0.8)))
        r.run()
        reason = hq.writes("review")[0][1]["review"]["reason"]
        for part in ("Relevant og med sandsynlig effekt.", "mindre udgave", "Pas på brand/pris.", "Svagt belæg."):
            self.assertIn(part, reason)

    def test_jev_failure_writes_nothing(self):
        hq = FakeHQ([idea()])
        r, c = runner(hq, jev={})
        r.run()
        self.assertEqual(hq.writes(), [])
        self.assertEqual(c["council"], 0)

    def test_existing_test_review_without_plan_skips_jev_and_starts_council(self):
        hq = FakeHQ([idea(review={"verdict": "test", "reason": "ok", "scores": []})])
        r, c = runner(hq)
        r.run()
        self.assertEqual((c["jev"], c["council"]), (0, 1))
        self.assertEqual(hq.writes(), [])

    def test_planned_idea_does_not_restart_council(self):
        hq = FakeHQ([idea(review={"verdict": "test", "reason": "ok", "scores": []}, plan={"hypothesis": "h"})])
        r, c = runner(hq)
        r.run()
        self.assertEqual(c["council"], 0)

    def test_council_plan_keeps_notes_and_14_days(self):
        p = ex.parse_plan('{"hypothesis":"h","change":"c","metric":{"type":"manuel"},"success":"s","council":{"model":"gpt-6-sol","notes":["SEO: ok","Salg: svag"]}}', [])
        self.assertEqual(p["days"], 14)
        self.assertEqual(p["council"]["notes"], ["SEO: ok", "Salg: svag"])
    def test_seo_keyword_demand_reaches_jev_state(self):
        hq = FakeHQ([idea(title='Få klik på "webdesign herning"', source={"kind": "gsc", "from": "seo"})])
        r, c = runner(hq, demand=lambda kw, n: {"questions": [f"{kw} pris", f"{kw} billig"]})
        r.run()
        self.assertEqual(c["states"][0]["efterspørgsel"]["google_forslag"], 2)
        self.assertIn("2 Google-forslag", hq.writes("review")[0][1]["review"]["reason"])

    def test_limit_caps_jev_calls(self):
        hq = FakeHQ([idea(id=f"e{i}") for i in range(5)])
        r, c = runner(hq)
        r.run(limit=2)
        self.assertEqual(c["jev"], 2)

    def test_geo_target_must_be_a_measured_question(self):
        p = ex.parse_plan('{"hypothesis":"h","change":"c","metric":{"type":"geo","target":"noget andet"},"success":"s"}', ["webbureau herning"])
        self.assertEqual(p["metric"], {"type": "manuel", "target": ""})
        dead = ex.parse_plan('{"hypothesis":"h","change":"c","metric":{"type":"gsc_page","target":"https://kinly.dk/findes-ikke"},"success":"s"}', [],
                             reachable=lambda url: "HTTP 404")
        self.assertEqual(dead["metric"]["type"], "manuel")
        with self.assertRaises(ValueError):
            ex.parse_plan('{"hypothesis":"","change":"c","success":"s"}', [])


class FollowTests(unittest.TestCase):
    GSC = {"type": "gsc_query", "target": "webdesign herning"}

    def test_first_run_after_start_saves_baseline_only(self):
        hq = FakeHQ([tester(self.GSC)], measurements={("gsc_query", "2026-09-03"): {"at": "x", "clicks": 2, "impressions": 80, "position": 9.1}})
        r, _ = runner(hq, now="2026-09-21T05:00:00+00:00")
        r.run()
        self.assertEqual([b["action"] for _, b in hq.writes()], ["baseline"])
        measure = [b for _, b in hq.calls if b.get("action") == "measure"][0]
        self.assertEqual((measure["start"], measure["end"]), ("2026-09-03", "2026-09-16"))

    def test_waits_for_gsc_lag_after_end(self):
        hq = FakeHQ([tester(self.GSC, baseline={"at": "x", "clicks": 2, "impressions": 80})])
        r, _ = runner(hq, now="2026-09-29T05:00:00+00:00")  # slut 27/9 + 3 dage = 30/9
        r.run()
        self.assertEqual(hq.writes(), [])

    def test_result_compares_numbers_and_creates_one_task(self):
        base = {"at": "x", "clicks": 2, "impressions": 80, "position": 9.1}
        hq = FakeHQ([tester(self.GSC, baseline=base)], measurements={("gsc_query", "2026-09-20"): {"at": "y", "clicks": 6, "impressions": 130, "position": 7.2}})
        r, c = runner(hq, now="2026-09-30T09:00:00+00:00")
        r.run()
        (_, res), (tpath, task) = hq.writes()
        self.assertEqual(res["outcome"]["verdict"], "behold")
        self.assertIn("Klik 2 → 6", res["outcome"]["summary"])
        self.assertEqual(tpath, ex.TASKS_PATH)
        self.assertEqual(task["title"], "Test færdig: Tilbyd logo-pakke — behold eller drop?")
        self.assertEqual((task["actor"], task["owner"], task["action"]), ("lucas", "lucas", "create"))
        self.assertEqual((c["jev"], c["council"]), (0, 0))  # resultat = ren tal-sammenligning

    def test_geo_waits_for_fresh_measurement_then_gives_up(self):
        metric = {"type": "geo", "target": "webbureau herning"}
        old = {"at": "2026-09-15T06:20:00+02:00", "mentioned": False}
        hq = FakeHQ([tester(metric, baseline=old)], measurements={"geo": old})
        r, _ = runner(hq, now="2026-09-28T05:00:00+00:00")
        r.run()
        self.assertEqual(hq.writes(), [])  # venter på næste mandag
        hq2 = FakeHQ([tester(metric, baseline=old)], measurements={"geo": old})
        r2, _ = runner(hq2, now="2026-10-06T05:00:00+00:00")
        r2.run()
        res = hq2.writes("result")[0][1]
        self.assertEqual(res["outcome"]["verdict"], "uklart")

    def test_geo_fresh_mention_is_behold(self):
        metric = {"type": "geo", "target": "webbureau herning"}
        hq = FakeHQ([tester(metric, baseline={"at": "2026-09-15T06:20:00Z", "mentioned": False})],
                    measurements={"geo": {"at": "2026-09-22T08:20:00+02:00", "mentioned": True}})
        r, _ = runner(hq, now="2026-09-28T05:00:00+00:00")
        r.run()
        self.assertEqual(hq.writes("result")[0][1]["outcome"]["verdict"], "behold")

    def test_manual_asks_lucas(self):
        hq = FakeHQ([tester({"type": "manuel", "target": ""})])
        r, _ = runner(hq, now="2026-09-28T09:00:00+00:00")
        r.run()
        actions = [b.get("action") for _, b in hq.writes()]
        self.assertEqual(actions, ["baseline", "result", "create"])
        res = hq.writes("result")[0][1]
        self.assertNotIn("result", res)
        self.assertIn("Mål selv", res["outcome"]["summary"])

    def test_dry_run_writes_nothing(self):
        hq = FakeHQ([idea(), tester({"type": "manuel", "target": ""})])
        r, c = runner(hq, dry=True, now="2026-09-28T09:00:00+00:00")
        r.run()
        self.assertEqual(hq.writes(), [])
        self.assertEqual(c["jev"], 1)


class SelfTest(unittest.TestCase):
    def test_selftest(self):
        ex._selftest()


if __name__ == "__main__":
    unittest.main()
