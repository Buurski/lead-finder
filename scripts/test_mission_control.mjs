#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const logic = readFileSync(new URL("../src/lib/next-action.ts", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/components/mission/MissionControl.tsx", import.meta.url), "utf8");

assert.match(logic, /if \(!s\.ok\)[\s\S]*Dataforbindelsen er nede/, "offline må være en tydelig fejltilstand");
assert.match(logic, /datafeed.*kræver et blik/, "døde feeds skal op i systemstatus");
assert.match(logic, /feed\.status !== "fresh"/, "ukendte feeds må ikke forsvinde lydløst fra statuskortet");
assert.doesNotMatch(view, /<h1[^>]*>\{hello\}/, "dashboardet må ikke berolige før datastatus er kendt");
assert.match(view, /className="kinly-control-grid"/, "dashboardet skal have hovedflow og kontekstpanel");
assert.match(view, /<DecisionPanel/, "næste handling skal være synlig i kontekstpanelet");
assert.match(view, /s\.pulse\.length/, "kundesager skal kunne ses fra dagsoverblikket");
assert.match(view, /GSC · ugetjek/, "GSC må ikke fremstilles som live dashboard-data");
assert.match(view, /PostHog · ugebrief/, "PostHog må ikke fremstilles som live dashboard-data");

console.log("mission control contract ok");
