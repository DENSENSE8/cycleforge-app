-- A drop-off repair ticket is born with its receiving record (owner 2026-09-29).
--
-- What + why: a walk-in / counter repair (`repair_service.intake_channel =
-- 'pickup'`) now lands a REPAIR-type inbound order through the one inbound
-- writer (`ingestInboundOrderInTx`), in the same transaction as the ticket.
-- `receiving_line_id` is the ticket → receiving link: the line carries the
-- repair flags (receiving_type 'REPAIR', intake_type 'repair',
-- is_repair_service, the `repair_service` line fact) and its carton is the
-- `R-{id}` Cmd-K shows on the repair hit.
--
-- Safety gating: additive nullable column + partial unique index; no writer
-- reads it until the code that stamps it ships. Existing tickets stay NULL
-- until `scripts/backfill-walk-in-repair-receiving.ts --apply` links them.
-- `ON DELETE SET NULL` lets `deleteInboundOrder` remove a mistaken order
-- without orphaning the ticket.
--
-- One ticket per line: the unique index refuses a second ticket on the same
-- receiving line (per org) and serves the carton → ticket join in search.
--
-- Rollback:
--   DROP INDEX IF EXISTS ux_repair_service_org_receiving_line;
--   ALTER TABLE repair_service DROP COLUMN IF EXISTS receiving_line_id;

BEGIN;

ALTER TABLE repair_service
  ADD COLUMN IF NOT EXISTS receiving_line_id INTEGER
    REFERENCES receiving_line(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_repair_service_org_receiving_line
  ON repair_service (organization_id, receiving_line_id)
  WHERE receiving_line_id IS NOT NULL;

COMMENT ON COLUMN repair_service.receiving_line_id IS
  'The receiving line a drop-off (intake_channel = pickup) ticket landed as; authored with the ticket by receiveWalkInRepairInTx.';

COMMIT;
