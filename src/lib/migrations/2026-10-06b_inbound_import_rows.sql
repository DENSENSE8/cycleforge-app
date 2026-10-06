-- 2026-10-06b_inbound_import_rows.sql
-- The uploaded file, row by row, kept with its import batch so the operator can
-- check an upload column by column: each file cell beside the value that landed
-- in inbound_order / receiving_line / receiving_line_return (operator 2026-10-06,
-- "ensure that all the data is uploaded to the database tables correctly").
--
--   inbound_import_batch gains the file's name, the preset that read it
--   (amazon_returns, amazon_fba_returns, ebay_returns, goodwill, …), its header
--   row and the column → field mapping that was used.
--   inbound_import_row is one row per data row of the file: the raw cells, the
--   order it grouped into, and the inbound_order / receiving_line it landed as.
--
-- Tenant: tenant-scoped from birth. The only writer is the import batch runner
-- (runInboundDraftBatch), which stamps organization_id explicitly.
--
-- ROLLBACK:
--   select relax_tenant_isolation('inbound_import_row');
--   DROP TABLE IF EXISTS inbound_import_row;
--   ALTER TABLE inbound_import_batch
--     DROP COLUMN IF EXISTS file_name, DROP COLUMN IF EXISTS preset,
--     DROP COLUMN IF EXISTS headers, DROP COLUMN IF EXISTS column_map;
--
-- VERIFY:
--   \d inbound_import_row

ALTER TABLE inbound_import_batch
  ADD COLUMN IF NOT EXISTS file_name  TEXT,
  ADD COLUMN IF NOT EXISTS preset     TEXT,
  ADD COLUMN IF NOT EXISTS headers    JSONB,
  ADD COLUMN IF NOT EXISTS column_map JSONB;

CREATE TABLE IF NOT EXISTS inbound_import_row (
  id                 BIGSERIAL PRIMARY KEY,
  organization_id    UUID NOT NULL,
  batch_id           BIGINT NOT NULL REFERENCES inbound_import_batch(id) ON DELETE CASCADE,
  row_number         INTEGER NOT NULL,               -- 1-based data row in the file (header excluded)
  cells              JSONB NOT NULL,                 -- header → raw cell text, exactly as uploaded
  order_key          TEXT,                           -- the order the row grouped into
  line_key           TEXT,
  status             TEXT NOT NULL,                  -- 'landed' | 'unchanged' | 'held' | 'failed'
  problem            TEXT,
  inbound_order_id   BIGINT REFERENCES inbound_order(id) ON DELETE SET NULL,
  receiving_line_id  INTEGER REFERENCES receiving_line(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inbound_import_row_org_batch_row_unique UNIQUE (organization_id, batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_inbound_import_row_org_batch
  ON inbound_import_row (organization_id, batch_id, row_number);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('inbound_import_row');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — inbound_import_row left without FORCE RLS';
  END IF;
END $$;
