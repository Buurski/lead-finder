import test from "node:test";
import assert from "node:assert/strict";
import { __setStore, InMemoryStore } from "./store.ts";
import {
  createPreviewRequest,
  readPreviewRequests,
  updatePreviewStatus,
  type PreviewRequestInput,
} from "./preview-queue.ts";

const fixture: PreviewRequestInput = {
  company: "Test & Co ApS",
  channel: "formular",
  email: "test@example.com",
};

test("inbound preview kan oprettes og skifte status", async () => {
  __setStore(new InMemoryStore());
  try {
    const created = await createPreviewRequest(fixture);
    assert.equal(created.company, fixture.company);
    assert.equal(created.status, "ny");
    assert.equal(created.channel, "formular");

    const updated = await updatePreviewStatus(created.id, "researcher", {
      research: "Falsk researchfixture",
    });
    assert.equal(updated?.status, "researcher");
    assert.equal(updated?.research, "Falsk researchfixture");
    const ready = await updatePreviewStatus(created.id, "preview klar", {
      previewUrl: "https://private.example/test",
    });
    const approved = await updatePreviewStatus(created.id, "godkendt");
    assert.equal(approved?.previewUrl, "https://private.example/test");
    assert.equal(approved?.research, "Falsk researchfixture");
    assert.equal(ready?.status, "preview klar");
    assert.equal((await readPreviewRequests()).length, 1);
  } finally {
    __setStore(null);
  }
});
