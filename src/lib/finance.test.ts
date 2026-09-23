import { test } from "node:test";
import assert from "node:assert/strict";
import { liveClientCount, mrrRunRate, stageOf } from "./finance.ts";

test("mrrRunRate/liveClientCount: aktivt abonnement (planMrr) er MRR uanset fase; nye faser mappes", () => {
  const rows = [
    { stage: "i_gang", monthlyFee: "250", planMrr: 250 },
    { stage: "betalt", monthlyFee: "750", planMrr: 750 },
    { stage: "leveret", monthlyFee: "", planMrr: 0 },
  ];
  assert.equal(mrrRunRate(rows), 1000);
  assert.equal(liveClientCount(rows), 2);
  assert.equal(stageOf({ stage: "leveret" }), "live");
  assert.equal(stageOf({ stage: "tilbud" }), "offer");
});
