-- Durable "label printed" stamp for the Unbox progress stepper's Print step.
--
-- Until now the Print step was tracked ONLY in localStorage
-- (`receiving-label-printed:<lineId>`), which is per-browser, lost on cache
-- clear, invisible to the server, and un-auditable — the wrong tracking for the
-- terminal, genuinely-varying step of the flow. This promotes it to a real
-- column on receiving_line_testing (the line-facts home that already holds
-- condition_set_at), so the step survives refresh / another device and is
-- queryable + auditable.
--
-- First-print wins (COALESCE-keep-first, mirroring condition_set_at). Writer:
-- POST /api/receiving/lines/[id]/label-printed. localStorage stays only as an
-- optimistic pre-reconcile hint on the client.
--
-- receiving_line_testing is already tenant-scoped (organization_id NOT NULL with
-- the GUC default + established policies), so no enforce_tenant_isolation() call
-- is needed for a plain column add. Read path: LEFT JOIN on its PK
-- (receiving_line_id), so no new index is required.

BEGIN;

ALTER TABLE receiving_line_testing
  ADD COLUMN IF NOT EXISTS label_printed_at timestamptz;

COMMENT ON COLUMN receiving_line_testing.label_printed_at IS
  'When a receiving label was first printed for this line (Unbox stepper Print step). First-print wins; set by POST /api/receiving/lines/[id]/label-printed. Replaces the legacy per-browser localStorage marker.';

-- One-time historical seed: mark every existing line as printed, stamped at the
-- line's RECEIVED time so the Print step reads done for past data. Source is
-- receiving_line.received_done_at — the authoritative "Received" (terminal DONE)
-- timestamp (receiving_line.received_at is the misleading door-scan arrival time,
-- not the received moment). Lines never marked received have no received time, so
-- they fall back to updated_at → created_at, the SAME proxy chain the
-- received_done_at column's own backfill used (2026-06-11). Idempotent: only
-- fills NULLs, so re-running never overwrites a real print stamp captured after
-- this migration ran.
UPDATE receiving_line_testing t
   SET label_printed_at = COALESCE(l.received_done_at, l.updated_at, l.created_at),
       updated_at       = now()
  FROM receiving_line l
 WHERE l.id = t.receiving_line_id
   AND t.label_printed_at IS NULL;

COMMIT;
