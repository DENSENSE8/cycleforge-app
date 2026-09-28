-- ============================================================================
-- 2026-09-28b_backfill_ticket_reason_no_po.sql
--
-- Owner ruling 2026-09-28: every ticket filed on a receiving line / carton
-- before tickets carried a reason is recorded as NO_PO (an investigation, the
-- Unfound family) — never a claim code. One receiving_exceptions row per
-- ticket + scope (line when filed on a line, else carton), matching the
-- writer recordTicketReason (src/lib/receiving/exceptions.ts).
--
-- Status: OPEN while the carton is still unidentified (unmatched, no PO);
-- RESOLVED (resolved_at = now) when it was already paired — the
-- investigation was answered before this row existed.
--
-- Sources, the same ones the list's claim_ticket reads
-- (src/lib/receiving/lines/sql-receiving-ticket.ts): ticket_links anchored on
-- RECEIVING_LINE / RECEIVING, then the legacy zendesk_ticket columns on
-- receiving_line / receiving_carton. Shipment mentions are not filed tickets.
--
-- SAFETY: insert-only and idempotent — a ticket + scope that already has any
-- exception row is skipped, so a re-run (or a ticket already reasoned by the
-- wizard) adds nothing. Runs as the owner with organization_id copied from
-- the source row. Depends on 2026-09-28_receiving_exceptions_carton_scope.
--
-- ROLLBACK: DELETE FROM receiving_exceptions
--            WHERE exception_code = 'NO_PO' AND reason = 'Backfill 2026-09-28: ticket filed before reasons';
-- VERIFY: SELECT status, count(*) FROM receiving_exceptions
--          WHERE reason = 'Backfill 2026-09-28: ticket filed before reasons' GROUP BY 1;
-- ============================================================================

WITH linked AS (
  SELECT tl.organization_id,
         CASE WHEN tl.entity_type = 'RECEIVING_LINE' THEN tl.entity_id END AS line_id,
         CASE WHEN tl.entity_type = 'RECEIVING' THEN tl.entity_id ELSE rl.receiving_id END AS carton_id,
         CASE
           WHEN st.provider = 'zendesk' AND NULLIF(TRIM(st.external_ticket_id), '') IS NOT NULL
             THEN '#' || TRIM(LEADING '#' FROM TRIM(st.external_ticket_id))
           WHEN st.id IS NOT NULL THEN '#' || st.id::text
           WHEN tl.zendesk_ticket_id IS NOT NULL THEN '#' || tl.zendesk_ticket_id::text
         END AS ticket,
         tl.created_at
    FROM ticket_links tl
    LEFT JOIN support_tickets st
      ON st.id = tl.support_ticket_id AND st.organization_id = tl.organization_id
    LEFT JOIN receiving_line rl
      ON tl.entity_type = 'RECEIVING_LINE' AND rl.id = tl.entity_id AND rl.organization_id = tl.organization_id
   WHERE tl.entity_type IN ('RECEIVING_LINE', 'RECEIVING')
),
legacy_line AS (
  SELECT rl.organization_id, rl.id AS line_id, rl.receiving_id AS carton_id,
         '#' || TRIM(LEADING '#' FROM TRIM(rl.zendesk_ticket)) AS ticket,
         rl.created_at
    FROM receiving_line rl
   WHERE NULLIF(TRIM(rl.zendesk_ticket), '') IS NOT NULL
),
legacy_carton AS (
  SELECT r.organization_id, NULL::int AS line_id, r.id AS carton_id,
         '#' || TRIM(LEADING '#' FROM TRIM(r.zendesk_ticket)) AS ticket,
         r.created_at
    FROM receiving_carton r
   WHERE NULLIF(TRIM(r.zendesk_ticket), '') IS NOT NULL
),
filed AS (
  SELECT DISTINCT ON (organization_id, ticket, COALESCE(line_id, 0), carton_id)
         organization_id, line_id, carton_id, ticket, created_at
    FROM (SELECT * FROM linked UNION ALL SELECT * FROM legacy_line UNION ALL SELECT * FROM legacy_carton) s
   WHERE ticket IS NOT NULL
     AND carton_id IS NOT NULL
   ORDER BY organization_id, ticket, COALESCE(line_id, 0), carton_id, created_at
)
INSERT INTO receiving_exceptions
  (organization_id, receiving_line_id, receiving_id, exception_code, reason, zendesk_ticket,
   status, resolved_at, created_at, updated_at)
SELECT f.organization_id, f.line_id, f.carton_id, 'NO_PO',
       'Backfill 2026-09-28: ticket filed before reasons', f.ticket,
       CASE WHEN unfound THEN 'OPEN' ELSE 'RESOLVED' END,
       CASE WHEN unfound THEN NULL ELSE NOW() END,
       COALESCE(f.created_at, NOW()), NOW()
  FROM filed f
  JOIN receiving_carton r ON r.id = f.carton_id AND r.organization_id = f.organization_id
  LEFT JOIN receiving_line_zoho rz
    ON f.line_id IS NOT NULL AND rz.receiving_line_id = f.line_id AND rz.organization_id = f.organization_id
  CROSS JOIN LATERAL (
    SELECT r.source = 'unmatched'
           AND NULLIF(TRIM(r.zoho_purchaseorder_id), '') IS NULL
           AND NULLIF(TRIM(rz.zoho_purchaseorder_id), '') IS NULL AS unfound
  ) u
 WHERE NOT EXISTS (
         SELECT 1 FROM receiving_exceptions rx
          WHERE rx.organization_id = f.organization_id
            AND rx.zendesk_ticket = f.ticket
            AND (CASE WHEN f.line_id IS NOT NULL THEN rx.receiving_line_id = f.line_id
                      ELSE rx.receiving_line_id IS NULL AND rx.receiving_id = f.carton_id END)
       );
