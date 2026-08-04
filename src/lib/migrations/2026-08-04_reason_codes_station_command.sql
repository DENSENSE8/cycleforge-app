-- ============================================================================
-- 2026-08-04: seed the station-command barcode vocabulary
-- (flow_context='station_command')
-- ============================================================================
-- Physical CMD-* stickers arm session modes on Arrival (CMD-BATCH-SORT /
-- CMD-DEFAULT). Engine SoT is src/lib/stations/station-command-codes.ts; these
-- rows make the vocabulary tenant-visible in Admin Reason Codes and printable
-- on 2×1" DataMatrix stock. category NULL (not a ledger axis), direction
-- 'either'. Idempotent per org via the composite natural key.
--
-- NOTE on the discriminator CHECK: this migration sorts AFTER every prior
-- reason_codes CHECK redefinition, so its value list is the one that sticks. It
-- is therefore the FULL CURRENT UNION — every context from 2026-06-29e PLUS
-- station_command — so nothing in active use is dropped.
--
-- Safety: seed-only + CHECK widen; no RLS change; writers already stamp org.
-- Rollback: DELETE FROM reason_codes WHERE flow_context = 'station_command';
--   then re-affirm the prior CHECK without station_command (new migration).
-- Verify: SELECT flow_context, code FROM reason_codes WHERE flow_context =
--   'station_command' GROUP BY 1,2;
-- ============================================================================

BEGIN;

-- Allow the new vocabulary (and re-affirm every in-use context) in the CHECK.
ALTER TABLE reason_codes DROP CONSTRAINT IF EXISTS reason_codes_flow_context_chk;
ALTER TABLE reason_codes ADD CONSTRAINT reason_codes_flow_context_chk
  CHECK (flow_context IN (
    'inventory_event','substitution','short_pick','receiving_exception',
    'repair_failure','verdict_detail','warranty_denial','inventory_adjust',
    'lifecycle_unshipped','lifecycle_outbound',
    'serial_absent_reason',
    'station_command'
  ));

INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
SELECT o.id, v.code, v.label, NULL, 'either', 'station_command', v.sort_order
FROM organizations o CROSS JOIN (VALUES
  ('CMD-BATCH-SORT', 'Batch sort',     10),
  ('CMD-DEFAULT',    'Default lookup', 20)
) AS v(code, label, sort_order)
ON CONFLICT (organization_id, flow_context, code) DO NOTHING;

COMMIT;
