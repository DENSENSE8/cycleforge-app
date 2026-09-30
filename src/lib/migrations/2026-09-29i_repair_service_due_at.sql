-- A repair ticket's SLA — `repair_service.due_at` (owner 2026-09-29).
--
-- What + why: every repair is due 3 BUSINESS days (Mon–Fri, no holidays —
-- the rule of `addBusinessDays` in src/lib/zendesk.ts) after it was received,
-- or after the ticket was opened when it never was. A shipped-in box still on
-- 'Incoming Shipment' is not in hand yet, so it has no due date. The repair
-- cards paint it top-right in the orders' SLA ladder (late · today · soon ·
-- later). TIMESTAMPTZ like the orders' ship-by (`work_assignments.deadline_at`).
--
-- Writers (all through `repairDueAt`, src/lib/repair/repair-due-at.ts — the
-- same math as the backfill below): ticket creation (`insertRepairRow`, the
-- warranty handoffs), the receive stamp (`add-unmatched-line`,
-- `updateRepairField('received_at')`) and every status write
-- (`updateRepairStatus`: fills a missing due date when the ticket leaves
-- Incoming Shipment, clears it when a ticket goes back to Incoming).
--
-- Math: the business days are counted on the PT civil calendar and the PT
-- wall-clock time is kept (a Friday 14:38 receive is due Wednesday 14:38):
-- Mon/Tue/Sun +3 days, Wed/Thu/Fri +5, Sat +4.
--
-- Safety gating: additive nullable column; the backfill only fills NULLs, so
-- a re-run is a no-op. Org-agnostic: the rule is the same for every tenant.
-- The search-outbox trigger does not watch due_at, so the backfill enqueues
-- nothing and leaves updated_at alone.
--
-- Rollback:
--   ALTER TABLE repair_service DROP COLUMN IF EXISTS due_at;
--
-- Verify:
--   SELECT count(*) FILTER (WHERE due_at IS NOT NULL)                                        AS with_due,
--          count(*) FILTER (WHERE due_at IS NULL AND status = 'Incoming Shipment')           AS incoming_null,
--          count(*) FILTER (WHERE due_at IS NULL AND status IS DISTINCT FROM 'Incoming Shipment') AS missing  -- 0
--     FROM repair_service;

ALTER TABLE repair_service
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

COMMENT ON COLUMN repair_service.due_at IS
  'SLA: 3 business days (Mon-Fri, PT) after received_at, else created_at; NULL while Incoming Shipment. Written by repairDueAt (src/lib/repair/repair-due-at.ts).';

UPDATE repair_service rs
   SET due_at = (
         (start.local_at + make_interval(days => CASE extract(isodow FROM start.local_at)::int
                                                   WHEN 3 THEN 5
                                                   WHEN 4 THEN 5
                                                   WHEN 5 THEN 5
                                                   WHEN 6 THEN 4
                                                   ELSE 3
                                                 END))
         AT TIME ZONE 'America/Los_Angeles'
       )
  FROM (
    SELECT id, COALESCE(received_at, created_at) AT TIME ZONE 'America/Los_Angeles' AS local_at
      FROM repair_service
  ) start
 WHERE start.id = rs.id
   AND rs.due_at IS NULL
   AND rs.status IS DISTINCT FROM 'Incoming Shipment'
   AND start.local_at IS NOT NULL;
