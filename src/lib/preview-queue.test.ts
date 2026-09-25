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
  contactName: "Testperson",
  branch: "café",
  questionnaire: "Vil gerne have flere frokostbookinger",
};

test("inbound preview kan oprettes og skifte status", async () => {
  __setStore(new InMemoryStore());
  try {
    const created = await createPreviewRequest(fixture);
    assert.equal(created.company, fixture.company);
    assert.equal(created.status, "ny");
    assert.equal(created.channel, "formular");
    assert.equal(created.contactName, "Testperson");
    assert.equal(created.questionnaire, "Vil gerne have flere frokostbookinger");

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
    const rejected = await updatePreviewStatus(created.id, "afvist");
    assert.ok(rejected?.rejectedAt);
    assert.equal((await readPreviewRequests()).length, 1);
  } finally {
    __setStore(null);
  }
});

test("låsen nede: henvendelsen går i nødloggen, kan læses og foldes ind ved næste skrivning (Sol R8-03/R9-01)", async () => {
  let lockDown = true;
  class LockDownStore extends InMemoryStore {
    override async put(key: string, value: unknown) {
      if (lockDown && key.startsWith("lock/")) throw new Error("postgres nede");
      return super.put(key, value);
    }
  }
  __setStore(new LockDownStore());
  try {
    const a = await createPreviewRequest(fixture);
    const b = await createPreviewRequest({ ...fixture, email: "b@example.com" });
    assert.deepEqual((await readPreviewRequests()).map((r) => r.id).sort(), [a.id, b.id].sort());
    lockDown = false;
    const up = await updatePreviewStatus(a.id, "researcher");
    assert.equal(up?.status, "researcher");
    const all = await readPreviewRequests();
    assert.equal(all.length, 2);
    assert.equal(all.find((r) => r.id === a.id)?.status, "researcher");
  } finally {
    __setStore(new InMemoryStore());
  }
});
