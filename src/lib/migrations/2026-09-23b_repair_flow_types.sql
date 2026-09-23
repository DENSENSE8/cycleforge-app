-- ============================================================================
-- 2026-09-23b_repair_flow_types.sql
--
-- WHAT: seed the repair flow types into the org-scoped `types` catalog:
--         repair          (label 'Repair')      — reconciles existing orgs with
--                                                 the runtime seedOrgCatalog list,
--                                                 which added it after 2026-06-13g
--         repair_service  (label 'Repair Service')
--         repair_return   (label 'Repair Return', is_return = true)
--       WHY: the unbox classify Type pill and the claim-ticket subject read the
--       org catalog; operators need Repair Service / Repair Return as first-class
--       carton flow types (intake_type), not ad-hoc customs. Seeding them as
--       is_system rows (hide-only, immutable slug) keeps every org on the same
--       vocabulary while leaving label/colour editable per org.
--
-- SAFETY: pure INSERT ... ON CONFLICT DO NOTHING against the existing
--   `types` table (2026-06-13g). No DDL, no writer changes; the PATCH
--   /api/receiving/[id] intake_type validator already unions the org catalog,
--   so seeded slugs become valid values the moment they exist.
--
-- ROLLBACK:
--   DELETE FROM types WHERE slug IN ('repair','repair_service','repair_return')
--     AND is_system = true
--     AND id NOT IN (SELECT type_id FROM receiving WHERE type_id IS NOT NULL
--                      UNION SELECT type_id FROM orders WHERE type_id IS NOT NULL);
--   (or plain DELETE when no rows reference them.)
--
-- VERIFY:
--   SELECT slug, label, is_return FROM types WHERE slug LIKE 'repair%' ORDER BY sort_order;
--   → every org owns repair / repair_service / repair_return.
-- ============================================================================

INSERT INTO types (organization_id, slug, label, kind, is_return, sort_order, is_system)
SELECT o.id, t.slug, t.label, 'receiving', t.is_return, t.sort_order, true
FROM organizations o
CROSS JOIN (VALUES
  ('repair',         'Repair',         false, 25),
  ('repair_service', 'Repair Service', false, 26),
  ('repair_return',  'Repair Return',  true,  27)
) AS t(slug, label, is_return, sort_order)
ON CONFLICT (organization_id, slug) DO NOTHING;
