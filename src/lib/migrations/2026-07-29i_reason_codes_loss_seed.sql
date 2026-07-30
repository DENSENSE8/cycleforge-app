-- ============================================================================
-- 2026-07-29i: seed the LOSS vocabulary under flow_context='receiving_exception'
-- ============================================================================
-- Phase 2 of docs/todo/ebay-delivered-not-unboxed-PLAN.md.
--
-- A carrier-delivered carton that never physically materialized (or arrived
-- empty) currently has no way to leave the "Delivered · not unboxed" lane except
-- by aging out of the query window — i.e. the exception disappears without anyone
-- recording what happened to the goods. These four codes are the terminal answer,
-- captured as an OPEN `receiving_exceptions` row by src/lib/receiving/loss-writeoff.ts
-- with NO lifecycle transition (the exception is an ORTHOGONAL dimension to the
-- status — see src/lib/receiving/workflow-stages.ts, which deliberately keeps
-- PROBLEM out of the status enum for exactly this reason). Keying the feed's exit
-- rule on that row's OPEN/RESOLVED status is also what makes the write-off
-- reversible when the carton turns up.
--
-- They live in the SAME behavior-bearing system registry as the OS&D and
-- photo-override codes — src/lib/receiving/exception-codes.ts,
-- LOSS_EXCEPTION_CODES — because the resolution path VALIDATES against them
-- (`isLossExceptionCode`, so an operator cannot write a carton off as 'SHORT',
-- and a tenant-authored custom code is rejected). As with 2026-06-28d and
-- 2026-07-29b, we seed them into reason_codes so a tenant can SEE and RELABEL
-- them in the Admin reason-codes manager, not add to them. Labels mirror
-- RECEIVING_EXCEPTION_META.
--
-- SORT_ORDER — 120/130/140/150 is NOT arbitrary. `seedOrgCatalog`
-- (src/lib/neon/catalog-queries.ts) walks RECEIVING_EXCEPTION_CODES assigning
-- 10, 20, 30 … so new orgs derive these numbers from array position. The composed
-- array is 7 OS&D + 4 photo-override = 11 codes (10–110), so this third
-- sub-vocabulary lands at 120–150. That is also why LOSS_EXCEPTION_CODES is
-- appended at the END of the composed array rather than spliced into the OS&D
-- block where it logically belongs: splicing would renumber the photo codes that
-- 2026-07-29b hardcoded at 80–110 and silently desync pre-existing orgs from
-- newly-seeded ones. `exception-codes.test.ts` parses this file and asserts every
-- pair below still matches the array walk.
--
-- NO DDL IN THIS FILE. In particular the discriminator CHECK
-- (reason_codes_flow_context_chk) is deliberately NOT touched:
-- 'receiving_exception' is ALREADY in the live union, whose current definition is
-- the last-sorting redefinition, 2026-06-29e_reason_codes_serial_absent.sql. That
-- constraint has a documented history of redefinitions that DROPPED values a
-- previous migration had added; re-declaring it here would risk repeating that
-- regression for zero benefit. Reusing the existing flow_context with a narrow
-- code subset is what keeps this migration DDL-free.
--
-- Idempotent per org via the composite natural key
-- (organization_id, flow_context, code).
-- ============================================================================

BEGIN;

INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
SELECT o.id, v.code, v.label, NULL, 'either', 'receiving_exception', v.sort_order
FROM organizations o CROSS JOIN (VALUES
  ('LOST_IN_TRANSIT', 'Lost',         120),
  ('EMPTY_BOX',       'Empty box',    130),
  ('MISDELIVERED',    'Misdelivered', 140),
  ('STOLEN',          'Stolen',       150)
) AS v(code, label, sort_order)
ON CONFLICT (organization_id, flow_context, code) DO NOTHING;

COMMIT;
