-- 2026-08-22b_receiving_line_status_override.sql
--
-- Adds an operator-facing, DISPLAY-ONLY status override to receiving_line so
-- staff can force the coarse rail/grid status to "Received" ahead of (or
-- regardless of) Zoho confirming its own receive, without touching
-- workflow_status or the real state machine — transitionReceivingLine()
-- (src/lib/receiving/state-machine.ts) still owns the actual lifecycle.
-- Consumer: railCoarseStatus() in src/lib/receiving/rail/status.ts, which
-- both the recent-activity rail and the Unbox/History grid status chip
-- read through (receivingCoarseStatusPaint / getReceivingStatusBadgeClass).
--
-- Why this can't reuse receiving_line_status: that column is a DB-trigger
-- mirror of workflow_status (2026-06-25_receiving_line_coarse_status_trigger.sql),
-- rewritten automatically on every workflow_status write. Repurposing it as a
-- manual override target would fight the trigger and silently break the
-- automation it exists for — hence a genuinely separate column here.
--
-- Safety gating: purely additive, nullable, no backfill. Every existing row
-- reads status_override = NULL, which is a no-op in railCoarseStatus (the
-- override branch only fires on the literal value 'RECEIVED') — so applying
-- this migration changes zero existing display behavior. The column is only
-- ever set going forward, via POST /api/receiving/lines/[id]/status-override
-- (org-scoped, permission-gated, audited).
--
-- Rollback:
--   ALTER TABLE receiving_line
--     DROP COLUMN IF EXISTS status_override,
--     DROP COLUMN IF EXISTS status_override_at,
--     DROP COLUMN IF EXISTS status_override_by;
--   ALTER TABLE receiving_line DROP CONSTRAINT IF EXISTS receiving_line_status_override_chk;
--
-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'receiving_line' AND column_name LIKE 'status_override%';

ALTER TABLE receiving_line
  ADD COLUMN IF NOT EXISTS status_override text,
  ADD COLUMN IF NOT EXISTS status_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_override_by bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receiving_line_status_override_chk'
  ) THEN
    ALTER TABLE receiving_line
      ADD CONSTRAINT receiving_line_status_override_chk
      CHECK (status_override IS NULL OR status_override = 'RECEIVED');
  END IF;
END $$;

COMMENT ON COLUMN receiving_line.status_override IS
  'Manual display-only override for the coarse rail/grid status (NULL or RECEIVED). Set via POST /api/receiving/lines/[id]/status-override. Never read by transitionReceivingLine() or any lifecycle logic — display SoT only (src/lib/receiving/rail/status.ts railCoarseStatus).';

COMMENT ON COLUMN receiving_line.status_override_at IS
  'Timestamp the status_override was last set (NULL when status_override is NULL).';

COMMENT ON COLUMN receiving_line.status_override_by IS
  'staff.id of who set the current status_override (NULL when status_override is NULL). Unenforced FK, matches sibling staff-id columns like received_by.';
