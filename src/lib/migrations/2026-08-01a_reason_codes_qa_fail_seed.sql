-- ============================================================================
-- 2026-08-01a: seed the QA-FAIL vocabulary under flow_context='receiving_exception'
-- ============================================================================
-- Follow-up 1 of docs/todo/note-grain-e2e-and-followups-EXECUTION-PROMPT.md.
--
-- The mobile QA action sheet (`ReceivingQaActionSheet.tsx`) offered a free-text
-- "reason" on its FAIL path and posted it to `mark-received` as `notes` — the
-- operator's item note (see .claude/rules/source-of-truth.md → Note vs label
-- grain). Two things were wrong with that: a reason typed on the phone would
-- overwrite whatever the desktop operator had written on EVERY line in the
-- carton, and the reason itself was unqueryable prose. (In practice the field was
-- never wired to the sheet, so no reason was captured at all — a promise in the
-- copy with nothing behind it.)
--
-- A QA fail reason is a receiving EXCEPTION: it has a first-class line-level home
-- (`receiving_exceptions`, code + free-text `reason`, OPEN/RESOLVED) and an
-- orthogonal-to-status dimension (src/lib/receiving/workflow-stages.ts). Two of
-- the three failure modes had no code, which is what this migration adds:
--
--   DEFECTIVE   the unit is here and undamaged, and does not work
--   INCOMPLETE  the unit is here and missing parts it needs
--
-- `DAMAGED` (OS&D, already seeded by 2026-06-28d) covers the third, so the fail
-- vocabulary reuses it rather than minting a prefixed twin. The three map 1:1 onto
-- the `qa_status_enum` FAILED_* values via QA_FAIL_EXCEPTION_STATUS in
-- src/lib/receiving/exception-codes.ts — the sheet used to hardcode
-- FAILED_FUNCTIONAL for every fail, so the column built to distinguish these
-- could not.
--
-- SORT_ORDER — 160/170 is NOT arbitrary. `seedOrgCatalog`
-- (src/lib/neon/catalog-queries.ts) walks RECEIVING_EXCEPTION_CODES assigning
-- 10, 20, 30 … so new orgs derive these numbers from array position. The composed
-- array is 7 OS&D + 4 photo-override + 4 loss = 15 codes (10–150), so this fourth
-- sub-vocabulary lands at 160–170. That is also why QA_FAIL_ONLY_CODES is appended
-- at the END of the composed array rather than spliced in beside DAMAGED where it
-- logically belongs: splicing would renumber the photo codes 2026-07-29b hardcoded
-- at 80–110 and the loss codes 2026-07-29i hardcoded at 120–150, silently
-- desyncing pre-existing orgs from newly-seeded ones. `exception-codes.test.ts`
-- parses this file and asserts every pair below still matches the array walk.
--
-- NO DDL IN THIS FILE. The discriminator CHECK (reason_codes_flow_context_chk) is
-- deliberately NOT touched: 'receiving_exception' is ALREADY in the live union,
-- and that constraint has a documented history of redefinitions that DROPPED
-- values a previous migration had added (see 2026-07-29i's header).
--
-- Idempotent per org via the composite natural key
-- (organization_id, flow_context, code).
-- ============================================================================

BEGIN;

INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
SELECT o.id, v.code, v.label, NULL, 'either', 'receiving_exception', v.sort_order
FROM organizations o CROSS JOIN (VALUES
  ('DEFECTIVE',  'Defective',     160),
  ('INCOMPLETE', 'Missing parts', 170)
) AS v(code, label, sort_order)
ON CONFLICT (organization_id, flow_context, code) DO NOTHING;

COMMIT;
