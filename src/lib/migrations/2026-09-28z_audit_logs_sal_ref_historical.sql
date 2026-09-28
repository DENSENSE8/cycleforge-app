-- audit_logs.station_activity_log_id becomes a historical pointer, not an FK.
--
-- What + why: the FK `audit_logs_station_activity_log_id_fkey` was declared
-- ON DELETE SET NULL. audit_logs is append-only evidence (guard_evidence_no_update
-- refuses every UPDATE), so the cascade's SET NULL is itself a refused write:
-- deleting ANY station_activity_logs row an audit row names fails. Live
-- casualties: un-pack (DELETE /api/packerlogs — 4.9k PACK_COMPLETED rows are
-- audited), scan-out undo (DELETE /api/shipped/scan-out — SHIP_CONFIRM rows are
-- audited). No FK action is compatible with an append-only child: SET NULL /
-- CASCADE write into the audit table, NO ACTION / RESTRICT make the parent row
-- undeletable, i.e. the operation irreversible.
--
-- The reversal is recorded, not erased: each reversing writer appends its own
-- audit row (PACK_COMPLETED → pack.reverse, SHIP_CONFIRM → shipment.scan_out.undo)
-- carrying the removed row's snapshot, and the original audit row keeps the id
-- it was written with. An audit row outliving its subject is what an audit log
-- is for — entity_id is already a plain value for the same reason.
--
-- Safety gating: drops a constraint only; no data change, no reader change
-- (every reader LEFT JOINs the SAL row). The index on the column stays.
-- Rollback (only if every dangling pointer is nulled first, which the guard
-- forbids — so in practice, don't):
--   ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_station_activity_log_id_fkey
--     FOREIGN KEY (station_activity_log_id) REFERENCES station_activity_logs(id)
--     ON DELETE SET NULL NOT VALID;
-- Verify:
--   SELECT count(*) FROM pg_constraint
--    WHERE conname = 'audit_logs_station_activity_log_id_fkey';   -- 0

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_station_activity_log_id_fkey;

COMMENT ON COLUMN audit_logs.station_activity_log_id IS
  'Historical pointer to the station_activity_logs row this entry recorded. Not an FK: '
  'the SAL row may be reversed (deleted) later; the reversal appends its own audit row. '
  'Readers must LEFT JOIN.';
