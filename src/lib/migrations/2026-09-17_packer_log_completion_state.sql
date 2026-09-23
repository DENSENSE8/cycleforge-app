-- A packer log doubles as the attachment parent for packing evidence.  Before
-- this migration, its mere existence implied a completed physical pack, which
-- made it impossible to upload evidence before confirming a mobile pack.
-- Existing rows are historical completion facts; new capture sessions start
-- CAPTURING and are excluded from packed/shipped read projections until the
-- finalization transaction changes them to COMPLETED.

ALTER TABLE packer_logs
  ADD COLUMN IF NOT EXISTS completion_state VARCHAR(20) NOT NULL DEFAULT 'COMPLETED';

UPDATE packer_logs
SET completion_state = 'COMPLETED'
WHERE completion_state IS NULL OR BTRIM(completion_state) = '';

ALTER TABLE packer_logs
  DROP CONSTRAINT IF EXISTS packer_logs_completion_state_chk;

ALTER TABLE packer_logs
  ADD CONSTRAINT packer_logs_completion_state_chk
  CHECK (completion_state IN ('CAPTURING', 'COMPLETED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_packer_logs_completed_shipment
  ON packer_logs (organization_id, shipment_id, created_at DESC)
  WHERE completion_state = 'COMPLETED' AND shipment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_packer_logs_capturing_shipment
  ON packer_logs (organization_id, shipment_id)
  WHERE completion_state = 'CAPTURING' AND shipment_id IS NOT NULL;
