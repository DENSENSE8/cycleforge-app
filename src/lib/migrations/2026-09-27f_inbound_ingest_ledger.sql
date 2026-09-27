-- ============================================================================
-- 2026-09-27f: inbound ingest ledger — one row per order landing attempt
-- ============================================================================
-- Every inbound order, from every source (triage form, CSV, chat, Zoho /
-- eBay / Amazon sync, auto-replenish), is recorded here BEFORE it lands:
--   - idempotent: (org, source, source_event_id) is unique, so a replayed
--     sync event or a re-posted form is recognised, and an unchanged payload
--     (same payload_hash) is skipped instead of re-written;
--   - visible: a failed order keeps its payload + error and is retried; after
--     the retry budget it is 'dead' (dead-letter) instead of disappearing;
--   - batched: a CSV / sync run groups its events under inbound_import_batch,
--     validated (dry run) before it commits.
--
-- Tenant-from-birth: the only writer (src/lib/inbound/ingest-ledger.ts) runs
-- inside withTenantTransaction / tenantQuery and stamps organization_id.
--
-- ROLLBACK:
--   select relax_tenant_isolation('inbound_ingest_event');
--   select relax_tenant_isolation('inbound_import_batch');
--   DROP TABLE IF EXISTS inbound_ingest_event;
--   DROP TABLE IF EXISTS inbound_import_batch;
-- ============================================================================

CREATE TABLE IF NOT EXISTS inbound_import_batch (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,
  origin           TEXT NOT NULL,
  source           TEXT NOT NULL,
  label            TEXT,
  status           TEXT NOT NULL DEFAULT 'staged',
  total            INTEGER NOT NULL DEFAULT 0,
  valid            INTEGER NOT NULL DEFAULT 0,
  landed           INTEGER NOT NULL DEFAULT 0,
  failed           INTEGER NOT NULL DEFAULT 0,
  created_by       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inbound_import_batch_origin_chk
    CHECK (origin IN ('manual', 'csv', 'chat', 'sync', 'auto_replenish', 'backfill')),
  CONSTRAINT inbound_import_batch_status_chk
    CHECK (status IN ('staged', 'validated', 'committing', 'committed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_inbound_import_batch_org_created
  ON inbound_import_batch (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inbound_ingest_event (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,
  batch_id          BIGINT REFERENCES inbound_import_batch(id) ON DELETE CASCADE,
  origin            TEXT NOT NULL,
  -- Where the order came from: 'form', 'csv', 'chat', 'zoho', 'ebay', 'amazon', 'replenish'.
  source            TEXT NOT NULL,
  -- The source's own idempotency handle: a sync's (order id + modified time),
  -- a CSV's (file hash + row), a form's client idempotency key.
  source_event_id   TEXT NOT NULL,
  payload           JSONB NOT NULL,
  payload_hash      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  outcome           JSONB,
  error             TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  inbound_order_id  BIGINT REFERENCES inbound_order(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  landed_at         TIMESTAMPTZ,
  CONSTRAINT inbound_ingest_event_origin_chk
    CHECK (origin IN ('manual', 'csv', 'chat', 'sync', 'auto_replenish', 'backfill')),
  CONSTRAINT inbound_ingest_event_status_chk
    CHECK (status IN ('pending', 'valid', 'invalid', 'landed', 'unchanged', 'failed', 'dead'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inbound_ingest_event_source
  ON inbound_ingest_event (organization_id, source, source_event_id);

CREATE INDEX IF NOT EXISTS idx_inbound_ingest_event_org_status
  ON inbound_ingest_event (organization_id, status, updated_at DESC)
  WHERE status IN ('pending', 'failed', 'dead', 'invalid');

CREATE INDEX IF NOT EXISTS idx_inbound_ingest_event_batch
  ON inbound_ingest_event (organization_id, batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_ingest_event_order
  ON inbound_ingest_event (organization_id, inbound_order_id)
  WHERE inbound_order_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('inbound_import_batch');
    PERFORM enforce_tenant_isolation('inbound_ingest_event');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — inbound ledger left without FORCE RLS';
  END IF;
END $$;
