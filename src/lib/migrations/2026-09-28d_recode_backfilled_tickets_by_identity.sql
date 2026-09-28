-- ============================================================================
-- 2026-09-28d_recode_backfilled_tickets_by_identity.sql
--
-- Owner ruling 2026-09-28 (supersedes "backfill them all as unfound" for
-- identified cartons): the carton's IDENTITY splits a pre-reason ticket.
--   unfound carton (unmatched, no PO on carton or line) → investigation, NO_PO
--     (2026-09-28b already wrote these OPEN — untouched here);
--   identified carton → a CLAIM, coded from a fact when one exists:
--     a QC-failed line   → its QA code (FAILED_DAMAGED → DAMAGED,
--                           FAILED_FUNCTIONAL → DEFECTIVE, FAILED_INCOMPLETE → INCOMPLETE)
--     else a short line  → SHORT (received < expected)
--     else               → CLAIM_UNSPECIFIED ("Claim", reason to be picked)
--   and re-opened (the NO_PO backfill had stamped it RESOLVED).
-- A line-level row reads its own line; a carton-level row reads any line.
--
-- SAFETY: touches ONLY rows 2026-09-28b wrote (reason = its marker) that still
-- carry NO_PO on an identified carton — so a rerun, or a ticket someone has
-- since given a reason, is left alone. Depends on 2026-09-28c (seed).
--
-- ROLLBACK: UPDATE receiving_exceptions
--              SET exception_code = 'NO_PO', status = 'RESOLVED', resolved_at = NOW(),
--                  reason = 'Backfill 2026-09-28: ticket filed before reasons', updated_at = NOW()
--            WHERE reason LIKE 'Backfill 2026-09-28d:%';
-- VERIFY: SELECT exception_code, status, count(*) FROM receiving_exceptions
--          WHERE reason LIKE 'Backfill 2026-09-28%' GROUP BY 1, 2;
-- ============================================================================

WITH target AS (
  SELECT rx.id, rx.receiving_line_id, rx.receiving_id, rx.organization_id
    FROM receiving_exceptions rx
    JOIN receiving_carton r ON r.id = rx.receiving_id AND r.organization_id = rx.organization_id
   WHERE rx.reason = 'Backfill 2026-09-28: ticket filed before reasons'
     AND rx.exception_code = 'NO_PO'
     AND NOT (
       r.source = 'unmatched'
       AND NULLIF(TRIM(r.zoho_purchaseorder_id), '') IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM receiving_line_zoho rz
          WHERE rz.organization_id = rx.organization_id
            AND NULLIF(TRIM(rz.zoho_purchaseorder_id), '') IS NOT NULL
            AND rz.receiving_line_id = COALESCE(rx.receiving_line_id, -1)
       )
     )
),
facts AS (
  SELECT t.id,
         (SELECT CASE MIN(CASE lt.qa_status::text
                            WHEN 'FAILED_DAMAGED' THEN 1
                            WHEN 'FAILED_FUNCTIONAL' THEN 2
                            WHEN 'FAILED_INCOMPLETE' THEN 3 END)
                   WHEN 1 THEN 'DAMAGED' WHEN 2 THEN 'DEFECTIVE' WHEN 3 THEN 'INCOMPLETE' END
            FROM receiving_line l
            JOIN receiving_line_testing lt ON lt.receiving_line_id = l.id AND lt.organization_id = l.organization_id
           WHERE l.organization_id = t.organization_id
             AND l.receiving_id = t.receiving_id
             AND (t.receiving_line_id IS NULL OR l.id = t.receiving_line_id)) AS qa_code,
         EXISTS (
           SELECT 1 FROM receiving_line l
            WHERE l.organization_id = t.organization_id
              AND l.receiving_id = t.receiving_id
              AND (t.receiving_line_id IS NULL OR l.id = t.receiving_line_id)
              AND l.quantity_expected IS NOT NULL
              AND COALESCE(l.quantity_received, 0) < l.quantity_expected
         ) AS short
    FROM target t
)
UPDATE receiving_exceptions rx
   SET exception_code = COALESCE(f.qa_code, CASE WHEN f.short THEN 'SHORT' END, 'CLAIM_UNSPECIFIED'),
       status = 'OPEN',
       resolved_at = NULL,
       resolved_by = NULL,
       reason = 'Backfill 2026-09-28d: claim on an identified carton, coded from '
                || CASE WHEN f.qa_code IS NOT NULL THEN 'its QC fail'
                        WHEN f.short THEN 'a short line'
                        ELSE 'nothing — reason to be picked' END,
       updated_at = NOW()
  FROM facts f
 WHERE rx.id = f.id;
