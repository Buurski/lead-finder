CREATE TABLE IF NOT EXISTS company_relation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  a_id uuid NOT NULL REFERENCES company(id),
  b_id uuid NOT NULL REFERENCES company(id),
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_relation_order CHECK (a_id < b_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS company_relation_pair_uq ON company_relation (a_id, b_id);
CREATE INDEX IF NOT EXISTS company_relation_b_id_idx ON company_relation (b_id);
