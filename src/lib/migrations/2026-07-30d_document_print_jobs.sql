-- 2026-07-30d_document_print_jobs.sql
-- JIT pack documents Phase 1 — immutable ledger for outbound document print
-- jobs (shipping_label / packing_slip) dispatched at pack-confirm or reprint.
-- Mirrors label_print_jobs (2026-07-06a): one row per physical print attempt;
-- reprints append (is_reprint=true); idempotent on (organization_id, client_event_id).
--
-- Also expands printer_profiles.default_for to include 'outbound' (PDF/laser
-- targets for PrintNode pdf_base64 jobs).
--
-- Safety: every writer stamps organization_id and runs under withTenantTransaction
-- / tenantQuery. enforce_tenant_isolation in the same migration.
--
-- ROLLBACK: select relax_tenant_isolation('document_print_jobs');
--           DROP TABLE IF EXISTS document_print_jobs;
--           then restore printer_profiles_default_for_chk to carton|product|bin|unit.

BEGIN;

CREATE TABLE IF NOT EXISTS document_print_jobs (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  packer_log_id       INTEGER REFERENCES packer_logs(id) ON DELETE SET NULL,
  document_id         INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_type       TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued',
  printer_profile_id  INTEGER REFERENCES printer_profiles(id) ON DELETE SET NULL,
  printnode_job_id    BIGINT,
  is_reprint          BOOLEAN NOT NULL DEFAULT false,
  reprint_of_id       BIGINT REFERENCES document_print_jobs(id) ON DELETE SET NULL,
  actor_staff_id      INTEGER,
  client_event_id     TEXT,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_print_jobs_document_type_chk
    CHECK (document_type IN ('shipping_label', 'packing_slip')),
  CONSTRAINT document_print_jobs_status_chk
    CHECK (status IN ('queued', 'dispatched', 'fallback_browser', 'failed', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_document_print_jobs_idempotency
  ON document_print_jobs (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_print_jobs_order
  ON document_print_jobs (organization_id, order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_print_jobs_packer_log
  ON document_print_jobs (organization_id, packer_log_id, created_at DESC)
  WHERE packer_log_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('document_print_jobs');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — document_print_jobs left without FORCE RLS';
  END IF;
END $$;

ALTER TABLE printer_profiles
  DROP CONSTRAINT IF EXISTS printer_profiles_default_for_chk;

ALTER TABLE printer_profiles
  ADD CONSTRAINT printer_profiles_default_for_chk
  CHECK (default_for IS NULL OR default_for IN ('carton', 'product', 'bin', 'unit', 'outbound'));

COMMENT ON COLUMN printer_profiles.default_for IS
  'Logical printer class: carton | product | bin | unit | outbound (PDF docs) | null (generic).';

COMMENT ON TABLE document_print_jobs IS
  'JIT pack documents Phase 1 — outbound PDF print ledger (PoPC / reprint).';

COMMIT;
