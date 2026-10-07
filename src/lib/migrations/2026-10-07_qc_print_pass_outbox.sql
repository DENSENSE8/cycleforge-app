-- ============================================================================
-- 2026-10-07_qc_print_pass_outbox.sql
--
-- QC instant print + pass outbox (docs/handoff/HANDOFF-qc-instant-print-2026-10-07.md).
--
-- Pressing Pass on the /test scan station prints the unit label client-side
-- with zero network round-trips, then fires ONE request to
-- POST /api/qc/units/[id]/print-pass. That route only inserts one row here
-- (idempotent on (organization_id, client_event_id)) and returns 202; a
-- background job (after() + cron sweep for retries) claims the row and does
-- the rest: print record (serial upsert, LABELED event, label_print_jobs row)
-- and, when pass = true, the PASS verdict via recordTestVerdict. Status flips
-- PENDING → DONE on success, FAILED on permanent failure / max attempts.
--
-- Safety gating: brand-new table, tenant-from-birth. The only writer is the
-- print-pass route (tenant transaction, explicit organization_id); the
-- sweep runs cross-org on the owner connection and stamps nothing new — so
-- enforcing FORCE RLS at birth is safe. No traffic until the route ships.
--
-- Shape follows .claude/rules/polymorphic-tables.md (typed-fact contract):
--   * BIGSERIAL id, organization_id NOT NULL with no DEFAULT in DDL
--     (enforce_tenant_isolation() installs the GUC default + FORCE RLS below)
--   * named CHECK on status (PENDING/DONE/FAILED)
--   * org-led unique idempotency key + org-led lookup index
--   * single parent → real FK ON DELETE CASCADE
--   * modeled in src/lib/drizzle/schema.ts (qcPrintPassOutbox)
--
-- Rollback:
--   DROP TABLE IF EXISTS qc_print_pass_outbox;
--
-- Verify:
--   \d qc_print_pass_outbox
--   SELECT relforcerowsecurity FROM pg_class WHERE relname = 'qc_print_pass_outbox'; -- t
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS qc_print_pass_outbox (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,                 -- NO default; enforce_tenant_isolation() installs it
  serial_unit_id   BIGINT NOT NULL REFERENCES serial_units(id) ON DELETE CASCADE,
  client_event_id  TEXT NOT NULL,                 -- client-minted idempotency key (one per press)
  actor_staff_id   INTEGER,                       -- operator who pressed Pass / reprint
  pass             BOOLEAN NOT NULL,              -- true = record PASS verdict; false = print record only (reprint)
  unit_uid         TEXT NOT NULL,                 -- the unit id the label printed (serial_units.unit_uid)
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb, -- { gtin, symbology, condition, notes, product_sku, sku_catalog_id, serial_number }
  status           TEXT NOT NULL DEFAULT 'PENDING',
  attempts         INTEGER NOT NULL DEFAULT 0,    -- bumped by each job claim
  claimed_at       TIMESTAMPTZ,                   -- last claim (stale-claim detection for the sweep)
  processed_at     TIMESTAMPTZ,                   -- DONE / FAILED flip time
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE qc_print_pass_outbox ADD CONSTRAINT qc_print_pass_outbox_status_chk
    CHECK (status IN ('PENDING','DONE','FAILED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE qc_print_pass_outbox IS
  'QC instant print + pass outbox: one row per Pass/reprint press, PENDING until the background job lands the print record (and PASS verdict when pass=true). Retries via cron sweep.';

COMMENT ON COLUMN qc_print_pass_outbox.payload IS
  'Print/verdict payload: { gtin, symbology, condition, notes, product_sku, sku_catalog_id, serial_number }.';

-- Idempotency: a replayed press (keepalive retry, double tap) never enqueues twice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_qc_print_pass_outbox_event
  ON qc_print_pass_outbox (organization_id, client_event_id);

-- Sweep claim scan: PENDING rows oldest-first. Partial + cross-org by design
-- (session-less cron on the owner connection, like workflow_tap_outbox).
CREATE INDEX IF NOT EXISTS idx_qc_print_pass_outbox_pending
  ON qc_print_pass_outbox (created_at)
  WHERE status = 'PENDING';

-- Org-led per-unit history / triage.
CREATE INDEX IF NOT EXISTS idx_qc_print_pass_outbox_org_unit
  ON qc_print_pass_outbox (organization_id, serial_unit_id, created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('qc_print_pass_outbox');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — qc_print_pass_outbox left without FORCE RLS';
  END IF;
END $$;

COMMIT;
