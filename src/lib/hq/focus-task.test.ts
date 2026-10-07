import { test } from "node:test";
import assert from "node:assert/strict";
import { focusTaskFromHref, subscribeTaskFocus } from "./focus-task.ts";

test("task-links signalerer hvert klik, dekoder id og fjerner lytteren", () => {
  const ids: string[] = [];
  const unsubscribe = subscribeTaskFocus((id) => ids.push(id));
  try {
    const href = "/opgaver?task=task-123#task-task-123";
    focusTaskFromHref(href);
    focusTaskFromHref(href);
    assert.deepEqual(ids, ["task-123", "task-123"], "samme href skal signalere igen");

    for (const other of ["/opgaver", "/virksomheder/abc", "/approve", "/approve?task=wrong", "/opgaver?task=", "/opgaver#task-wrong"]) {
      focusTaskFromHref(other);
    }
    assert.deepEqual(ids, ["task-123", "task-123"], "andre links må ikke signalere");

    const specialId = "deal:æ ø/+&?#%";
    focusTaskFromHref(`/opgaver?task=${encodeURIComponent(specialId)}#task-${encodeURIComponent(specialId)}`);
    assert.deepEqual(ids, ["task-123", "task-123", specialId]);

    unsubscribe();
    focusTaskFromHref(href);
    assert.deepEqual(ids, ["task-123", "task-123", specialId], "ingen lytter efter unsubscribe");
  } finally {
    unsubscribe();
  }
});
