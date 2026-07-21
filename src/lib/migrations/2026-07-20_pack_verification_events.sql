-- ============================================================================
-- 2026-07-20_pack_verification_events.sql
--
-- Packer Review Station verification spine (docs/todo/packer-review-station-plan.md
-- Phase 3). One row = one append-only verification / review OUTCOME about a
-- packer_log — the direct replacement for the sketch's proposed
-- orders.verify_status / orders.packing_metadata columns, which we do NOT add
-- (no ALTER on orders / packer_logs; review is a fact stream, not a parent
-- column). Latest outcome per packer_log is derived, latest-wins:
--   SELECT DISTINCT ON (organization_id, entity_type, entity_id) ...
--   ORDER BY organization_id, entity_type, entity_id, created_at DESC, id DESC
-- (same shape as order_unit_amendments / entity_signals).
--
-- Contract: .claude/rules/polymorphic-tables.md.
--   * entity_type — named CHECK. 'PACKER_LOG' only at birth (the packer mode).
--     tech / receiving / shipping review land as later CHECK-expanding
--     migrations when those Review modes ship. entity_id = packer_logs.id.
--   * entity_id is BIGINT (contract default) even though packer_logs.id is
--     INTEGER today — future-proofs the polymorphic key and avoids a fragile
--     int8->int4 FK, so parent-delete integrity rides the trigger family below
--     (dispatch on TG_ARGV[0]) rather than a real FK.
--   * outcome — CHECK-constrained TEXT (extends more easily than a pg ENUM per
--     the contract). The 8-value union covers floor capture, manager review,
--     and EOD reconciliation (Phase 5):
--       UNVERIFIED | VERIFIED
--       REVIEW_APPROVED | REVIEW_FLAGGED
--       READY | ERROR_MISSING_TRACKING | ERROR_COUNT_MISMATCH | ERROR_OCR_FAILED
--   * shelf_box_count / expected_count / meta — EOD columns ship now (Phase 5a),
--     no UI until Phase 5b; nothing here blocks the Review station.
--   * client_event_id — idempotency (partial-unique per org); a packer/manager
--     retry on a flaky network is a no-op, matching inventory_events / amendments.
--
-- Safety gating: brand-new table, zero writers at author time. The only writer
-- (recordPackVerificationEvent, Phase 3c) stamps organization_id explicitly and
-- runs under withTenantTransaction, so tenant-from-birth FORCE RLS is safe
-- immediately (no app-layer-only window).
--
-- ROLLBACK (function first — its trigger lives ON packer_logs, so a bare table
-- drop would leave a dangling trigger erroring every packer_logs DELETE):
--   select relax_tenant_isolation('pack_verification_events');
--   DROP FUNCTION IF EXISTS fn_delete_pack_verification_events_on_parent_delete() CASCADE;
--   DROP TABLE IF EXISTS pack_verification_events;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pack_verification_events (
  id                     BIGSERIAL PRIMARY KEY,
  organization_id        UUID NOT NULL,            -- no DEFAULT; enforce_tenant_isolation() installs it
  entity_type            TEXT NOT NULL,            -- named CHECK below; 'PACKER_LOG' at birth
  entity_id              BIGINT NOT NULL,          -- packer_logs.id (BIGINT per contract; parent is INTEGER today)
  shipment_id            BIGINT,                   -- soft denormalized query assist (packer_logs.shipment_id)
  outcome                TEXT NOT NULL DEFAULT 'UNVERIFIED',  -- named CHECK below
  detected_order_id      TEXT,                     -- OCR / desktop-payload detected order number
  detected_tracking      TEXT,                     -- OCR / desktop-payload detected tracking
  ocr_confidence         REAL,                     -- 0..1 slip-OCR confidence (NULL when manual)
  shelf_box_count        INTEGER,                  -- EOD detector/manual count (Phase 5)
  expected_count         INTEGER,                  -- EOD expected = today's REVIEW_APPROVED count (Phase 5)
  verified_by_staff_id   INTEGER,                  -- packer (capture) or manager (review) staff id
  review_note            TEXT,                     -- required on REVIEW_FLAGGED (enforced app-side)
  client_event_id        UUID,                     -- idempotency key (partial-unique per org)
  meta                   JSONB,                    -- gate metrics, EOD bbox JSON, detector provenance
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE pack_verification_events ADD CONSTRAINT pack_verification_events_entity_type_chk
    CHECK (entity_type IN ('PACKER_LOG'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE pack_verification_events ADD CONSTRAINT pack_verification_events_outcome_chk
    CHECK (outcome IN (
      'UNVERIFIED','VERIFIED',
      'REVIEW_APPROVED','REVIEW_FLAGGED',
      'READY','ERROR_MISSING_TRACKING','ERROR_COUNT_MISMATCH','ERROR_OCR_FAILED'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Latest-outcome-per-packer_log (DISTINCT ON) + per-entity timeline read.
CREATE INDEX IF NOT EXISTS idx_pack_verification_events_org_entity_time
  ON pack_verification_events (organization_id, entity_type, entity_id, created_at DESC, id DESC);

-- Queue / "approved today" rollups by outcome over time.
CREATE INDEX IF NOT EXISTS idx_pack_verification_events_org_outcome_time
  ON pack_verification_events (organization_id, outcome, created_at DESC, id DESC);

-- Shipment cross-reference assist (soft; only rows that carry a shipment).
CREATE INDEX IF NOT EXISTS idx_pack_verification_events_org_shipment
  ON pack_verification_events (organization_id, shipment_id)
  WHERE shipment_id IS NOT NULL;

-- Idempotency: a threaded client_event_id collapses a retry to a no-op. Partial
-- unique (NULLs excluded) so callers without a key are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pack_verification_events_client_event
  ON pack_verification_events (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

COMMENT ON TABLE pack_verification_events IS
  'Append-only packer verification/review outcomes (plan: packer-review-station-plan.md Phase 3). Latest-wins per (org, entity_type, entity_id); never ALTER orders/packer_logs. Tenant-scoped from birth.';

-- Parent-delete integrity: cascade-delete a packer_log's verification events with
-- it. Trigger family dispatches on TG_ARGV[0] (one trigger per nameable parent;
-- PACKER_LOG is the only parent at birth — new discriminator values add their
-- trigger in the same migration that expands the CHECK).
CREATE OR REPLACE FUNCTION fn_delete_pack_verification_events_on_parent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM pack_verification_events
  WHERE entity_type = TG_ARGV[0]
    AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_pack_verification_events_on_packer_log_delete ON packer_logs;
CREATE TRIGGER trg_delete_pack_verification_events_on_packer_log_delete
AFTER DELETE ON packer_logs
FOR EACH ROW EXECUTE FUNCTION fn_delete_pack_verification_events_on_parent_delete('PACKER_LOG');

-- Tenant-from-birth enforcement (installs the loud-fail org default, FORCE RLS,
-- and the canonical tenant_isolation policy in one call).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('pack_verification_events');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — pack_verification_events left without FORCE RLS';
  END IF;
END $$;

COMMIT;
