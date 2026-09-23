import test from "node:test";
import assert from "node:assert/strict";
import { __setStore, InMemoryStore } from "./store.ts";
import { addNote, deleteNote, listNotes, notesKey } from "./mit-rum.ts";

test("mit-rum: tilføj, list (nyeste først) og slet egne noter", async () => {
  __setStore(new InMemoryStore());
  try {
    const first = await addNote("lucas", "  husk at ringe til Novo  ");
    assert.equal(first.text, "husk at ringe til Novo");
    assert.ok(first.id);
    const second = await addNote("lucas", "betal moms");
    assert.notEqual(first.id, second.id);

    const mine = await listNotes("lucas");
    assert.equal(mine.length, 2);
    assert.equal(mine[0].id, second.id); // nyeste først

    assert.equal(await deleteNote("lucas", second.id), true);
    assert.deepEqual((await listNotes("lucas")).map((n) => n.id), [first.id]);
    assert.equal(await deleteNote("lucas", second.id), false); // allerede slettet
    assert.equal(await deleteNote("lucas", "findes-ikke"), false);
  } finally {
    __setStore(null);
  }
});

test("mit-rum: noter er personspecifikke — sletning af andens note er no-op", async () => {
  __setStore(new InMemoryStore());
  try {
    const lucasNote = await addNote("lucas", "hemmelig");
    await addNote("charlie", "charlies note");

    assert.equal(await deleteNote("charlie", lucasNote.id), false);
    assert.equal((await listNotes("lucas")).length, 1);
    assert.deepEqual((await listNotes("charlie")).map((n) => n.text), ["charlies note"]);

    // Nøglen er pr. bruger — ingen delt bøtte.
    assert.equal(notesKey("lucas"), "private/u/lucas/notes");
    assert.equal(notesKey("charlie"), "private/u/charlie/notes");
  } finally {
    __setStore(null);
  }
});

test("mit-rum: validering af tekst", async () => {
  __setStore(new InMemoryStore());
  try {
    await assert.rejects(() => addNote("lucas", "   "), /tom/);
    await assert.rejects(() => addNote("lucas", "x".repeat(2001)), /2000/);
    // Grænsen selv er tilladt.
    const ok = await addNote("lucas", "x".repeat(2000));
    assert.equal(ok.text.length, 2000);
  } finally {
    __setStore(null);
  }
});

test("mit-rum: tom liste uden noter", async () => {
  __setStore(new InMemoryStore());
  try {
    assert.deepEqual(await listNotes("lucas"), []);
  } finally {
    __setStore(null);
  }
});
