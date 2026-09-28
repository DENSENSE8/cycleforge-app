-- ============================================================================
-- 2026-09-28c: seed CLAIM_UNSPECIFIED under flow_context='receiving_exception'
-- ============================================================================
-- Owner ruling 2026-09-28 (Inbound › Unboxed): a ticket filed on an IDENTIFIED
-- carton is a claim; one on an unfound carton is an investigation. For claims
-- no fact names (not a short line, not a QC fail) the reason is recorded as
-- CLAIM_UNSPECIFIED ("Claim") until a person picks one — never a guessed code.
--
-- SORT_ORDER — 180 is the array walk: 7 OS&D + 4 photo + 4 loss + 2 QA = 17
-- codes (10–170), and CLAIM_ONLY_CODES is appended at the END of
-- RECEIVING_EXCEPTION_CODES (src/lib/receiving/exception-codes.ts).
-- `exception-codes.test.ts` parses this file and asserts the pair.
--
-- NO DDL. Idempotent per org via (organization_id, flow_context, code).
-- ============================================================================

BEGIN;

INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
SELECT o.id, v.code, v.label, NULL, 'either', 'receiving_exception', v.sort_order
FROM organizations o CROSS JOIN (VALUES
  ('CLAIM_UNSPECIFIED', 'Claim', 180)
) AS v(code, label, sort_order)
ON CONFLICT (organization_id, flow_context, code) DO NOTHING;

COMMIT;
