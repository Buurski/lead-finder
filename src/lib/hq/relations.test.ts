import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { company } from "../db/schema.ts";
import { freshTestDb } from "../db/test-db.ts";
import { addRelation, listRelations, relationPair, removeRelation, RelationError } from "./relations.ts";

test("sorterer par og afviser relation til samme virksomhed", () => {
  assert.deepEqual(relationPair("b", "a"), { aId: "a", bId: "b" });
  assert.throws(() => relationPair("a", "a"), RelationError);
});

test("relationer er symmetriske, unikke og kan kun fjernes fra en part", async () => {
  const db = await freshTestDb();
  // Migrationen registreres af orkestratoren; testdatabasen opretter tabellen selv.
  await db.execute(sql`CREATE TABLE IF NOT EXISTS company_relation (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), a_id uuid NOT NULL REFERENCES company(id), b_id uuid NOT NULL REFERENCES company(id), label text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT company_relation_order CHECK (a_id < b_id))`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS company_relation_pair_uq ON company_relation (a_id, b_id)`);
  const [a, b, c] = await db.insert(company).values([
    { rowNo: 991001, name: "Jernbanecaféen" },
    { rowNo: 991002, name: "Lej en Kok" },
    { rowNo: 991003, name: "Anden" },
  ]).returning({ id: company.id });
  const first = await addRelation(db, a.id, b.id, "samme ejer");
  const again = await addRelation(db, b.id, a.id, "henviste os");
  assert.equal(first.id, again.id);
  assert.deepEqual((await listRelations(db, a.id)).map((r) => [r.name, r.label]), [["Lej en Kok", "henviste os"]]);
  assert.equal((await listRelations(db, b.id))[0].otherId, a.id);
  await assert.rejects(() => removeRelation(db, c.id, first.id), RelationError);
  await removeRelation(db, b.id, first.id);
  assert.deepEqual(await listRelations(db, a.id), []);
});
