-- ============================================================================
-- 2026-07-29b: seed the photo-policy OVERRIDE vocabulary (+ close the
-- RETURN_NO_ORDER seed gap) under flow_context='receiving_exception'
-- ============================================================================
-- The receiving photo-evidence gate becomes a SOFT block: an operator may
-- receive a carton the gate flagged, but only by naming a REASON CODE (never
-- free text), which is persisted as a receiving_exceptions row and audited.
--
-- Those override codes live in the SAME behavior-bearing system registry as the
-- OS&D codes — src/lib/receiving/exception-codes.ts,
-- RECEIVING_EXCEPTION_CODES + PHOTO_POLICY_OVERRIDE_CODES — because the receive
-- routes VALIDATE against them (a tenant-authored custom code is rejected). As
-- with 2026-06-28d, we seed them into reason_codes so a tenant can SEE and
-- RELABEL them in the Admin reason-codes manager, not add to them. Labels
-- mirror RECEIVING_EXCEPTION_META. New orgs get the same set from
-- seedOrgCatalog (src/lib/neon/catalog-queries.ts), which walks
-- RECEIVING_EXCEPTION_CODES in array order at sort_order 10, 20, … — hence the
-- 80/90/100/110 below, which match that walk exactly.
--
-- NO DDL IN THIS FILE. In particular the discriminator CHECK
-- (reason_codes_flow_context_chk) is deliberately NOT touched:
-- 'receiving_exception' is ALREADY in the live union, whose current definition
-- is the last-sorting redefinition, 2026-06-29e_reason_codes_serial_absent.sql.
-- That constraint has a documented history of redefinitions that DROPPED values
-- a previous migration had added; re-declaring it here would risk repeating
-- that regression for zero benefit. Reusing the existing flow_context with a
-- narrow code subset is what keeps this migration DDL-free.
--
-- ALSO closes a pre-existing seed gap: RETURN_NO_ORDER has been in
-- RECEIVING_EXCEPTION_CODES (and therefore seeded for NEW orgs) since the
-- returns work, but 2026-06-28d seeded only 6 codes and omitted it, so orgs
-- that existed before then are missing that row. One extra tuple under the same
-- ON CONFLICT DO NOTHING closes it at zero risk.
--
-- Idempotent per org via the composite natural key
-- (organization_id, flow_context, code).
-- ============================================================================

BEGIN;

INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
SELECT o.id, v.code, v.label, NULL, 'either', 'receiving_exception', v.sort_order
FROM organizations o CROSS JOIN (VALUES
  -- backfill: omitted by 2026-06-28d, already seeded for new orgs
  ('RETURN_NO_ORDER',             'Return · no order',  70),
  -- photo-policy gate override sub-vocabulary
  ('PHOTO_WAIVED_NO_DEVICE',      'No camera',          80),
  ('PHOTO_WAIVED_UPLOAD_FAILED',  'Upload failed',      90),
  ('PHOTO_WAIVED_NOT_APPLICABLE', 'Not applicable',    100),
  ('PHOTO_WAIVED_DEFERRED',       'Photos to follow',  110)
) AS v(code, label, sort_order)
ON CONFLICT (organization_id, flow_context, code) DO NOTHING;

COMMIT;
