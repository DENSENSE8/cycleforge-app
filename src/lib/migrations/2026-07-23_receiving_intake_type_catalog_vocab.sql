-- ============================================================================
-- 2026-07-23_receiving_intake_type_catalog_vocab.sql
--
-- What: Drop the hard-coded intake_type CHECK (PO|RETURN|TRADE_IN) and seed the
--       built-in REPAIR type for every org. Catalog + API already own the
--       vocabulary (org types ∪ builtins); the CHECK blocked Repair and any
--       custom flow type from persisting.
--
-- Target: `receiving_carton`, NOT `receiving`. Post spine-cutover (2026-07-11)
--         `receiving` is a compat VIEW; the constraint lives on the base table.
--         `ALTER TABLE <view> DROP CONSTRAINT` is a hard error even with
--         IF EXISTS — the ALTER action itself is invalid on a view.
--
-- Why safe: Writers still validate against getOrgTypes ∪ builtins before UPDATE.
--           No data rewrite — only constraint removal + idempotent seed insert.
--
-- Rollback:
--   ALTER TABLE receiving_carton DROP CONSTRAINT IF EXISTS receiving_intake_type_allowed;
--   ALTER TABLE receiving_carton ADD CONSTRAINT receiving_intake_type_allowed
--     CHECK (intake_type IS NULL OR intake_type IN ('PO', 'RETURN', 'TRADE_IN'));
--   DELETE FROM types WHERE slug = 'repair' AND is_system = true;
--
-- Verify:
--   SELECT conname FROM pg_constraint WHERE conname = 'receiving_intake_type_allowed';
--     → 0 rows
--   SELECT COUNT(*) FROM types WHERE slug = 'repair' AND is_system = true;
--     → = number of orgs
-- ============================================================================

ALTER TABLE receiving_carton
  DROP CONSTRAINT IF EXISTS receiving_intake_type_allowed;

-- Seed Repair for orgs that already ran the original catalog seed (ON CONFLICT
-- leaves existing custom "repair" rows untouched).
INSERT INTO types (organization_id, slug, label, kind, is_return, sort_order, is_system)
SELECT o.id, 'repair', 'Repair', 'receiving', false, 25, true
FROM organizations o
ON CONFLICT (organization_id, slug) DO NOTHING;
