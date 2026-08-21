-- 2026-08-20d_reason_codes_command_vocabulary.sql
--
-- Backfill the FULL station-command vocabulary into reason_codes for every org
-- that already exists (flow_context = 'station_command').
--
-- Plan: docs/todo/universal-scan-router-PLAN.md (P5).
--
-- WHAT CHANGED. 2026-08-04 seeded the two session commands that were the whole
-- vocabulary then (CMD-BATCH-SORT / CMD-DEFAULT). Since 2026-08-20 there are 25
-- more: 19 `CMD-GO-*` surface jumps and 6 verdict / compound actions. Without
-- this backfill they exist in code and work when scanned, but are invisible in
-- Admin › Reason Codes, so an operator cannot see the catalog or relabel a row.
--
-- THIS IS FOR EXISTING ORGS ONLY. Every NEW org is seeded by `seedOrgCatalog`
-- (src/lib/neon/catalog-queries.ts), which now derives its list from
-- `listSeedableCommandCodes()` — a union of the three code registries. That is
-- the fix for the underlying defect: that block iterated STATION_COMMAND_CODES
-- alone, so every code added to the nav or action registry was silently absent
-- for every org, and nothing anywhere could notice. A migration backfills the
-- past; the derived seeder is what keeps the future correct.
--
-- BEHAVIOUR IS NOT SEEDED. These rows are for Admin visibility, relabel and
-- 2×1" print. Scanning behaviour lives in the code registries and is
-- PR-reviewed; inventing a row here arms nothing. (A tenant that wants its own
-- scan string uses a station_command_aliases row — 2026-08-20c — which points
-- at one of these built-ins and cannot create a new one.)
--
-- NO CHECK CHANGE. `station_command` was added to reason_codes_flow_context_chk
-- by 2026-08-04 and is still in the live union. This migration only INSERTs, so
-- it cannot re-open the constraint-ordering trap that file documents.
--
-- ON CONFLICT DO NOTHING, DELIBERATELY. The two 2026-08-04 rows keep their
-- original sort_order (10 / 20) rather than the 2010 / 2020 this file would
-- give them, so they sort above the jump codes in the Admin list. That is
-- accepted on purpose: a seed must never stomp a row a tenant may have
-- relabelled or reordered, and a slightly odd ordering is a far cheaper
-- outcome than silently overwriting tenant data.
--
-- ROLLBACK:
--   DELETE FROM reason_codes
--    WHERE flow_context = 'station_command'
--      AND code NOT IN ('CMD-BATCH-SORT', 'CMD-DEFAULT');
--
-- VERIFY:
--   SELECT o.name, count(*) FROM reason_codes r
--     JOIN organizations o ON o.id = r.organization_id
--    WHERE r.flow_context = 'station_command' GROUP BY 1;

BEGIN;

INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
SELECT o.id, v.code, v.label, NULL, 'either', 'station_command', v.sort_order
FROM organizations o CROSS JOIN (VALUES
  -- Go — move between surfaces (registry sortOrder + 0)
  ('CMD-GO-ARRIVAL',     'Go · Arrival',          10),
  ('CMD-GO-UNBOX',       'Go · Unbox',            20),
  ('CMD-GO-QC',          'Go · Quality Control',  30),
  ('CMD-GO-READY',       'Go · Ready to Pack',    40),
  ('CMD-GO-PACK',        'Go · Packing',          50),
  ('CMD-GO-SCANOUT',     'Go · Scan out',         60),
  ('CMD-GO-PICKUP',      'Go · Local Pickup',     70),
  ('CMD-GO-REPAIR',      'Go · Repair',           80),
  ('CMD-GO-COUNTER',     'Go · Counter',          90),
  ('CMD-GO-INBOUND',     'Go · Inbound',         110),
  ('CMD-GO-LABELS',      'Go · Labels',          120),
  ('CMD-GO-ORDERS',      'Go · Orders',          130),
  ('CMD-GO-FBA',         'Go · Amazon prep',     140),
  ('CMD-GO-INVENTORY',   'Go · Inventory',       150),
  ('CMD-GO-LOCATIONS',   'Go · Locations',       160),
  ('CMD-GO-PRODUCTS',    'Go · Products',        170),
  ('CMD-GO-SUPPORT',     'Go · Support',         180),
  ('CMD-GO-OPS',         'Go · Operations',      190),
  ('CMD-GO-HOME',        'Go · Home',            200),
  -- Do — record a verdict (registry sortOrder + 1000). These WRITE.
  ('CMD-PASS',           'Pass',                1010),
  ('CMD-FAIL',           'Fail',                1020),
  ('CMD-TEST-AGAIN',     'Test again',          1030),
  ('CMD-PASS-GO-READY',  'Pass → Ready to Pack',1110),
  ('CMD-PASS-GO-PACK',   'Pass → Packing',      1120),
  ('CMD-FAIL-GO-REPAIR', 'Fail → Repair',       1130)
) AS v(code, label, sort_order)
ON CONFLICT (organization_id, flow_context, code) DO NOTHING;

COMMIT;
