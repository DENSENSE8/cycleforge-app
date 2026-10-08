-- ============================================================================
-- 2026-10-08_fba_fnskus_paired_condition_grade.sql
--
-- WHAT: fba_fnskus.paired_condition_grade, the house condition grade (1–7,
-- condition_grade_enum) that a QC pairing binds an FNSKU to. Also a per-org
-- unique index, so one inventory SKU at one house grade has at most one
-- FNSKU.
--
-- WHY: the Quality control bench pairs many FNSKUs to one inventory SKU, one
-- per house grade (owner 2026-10-08). The house grade codes are independent
-- of the Amazon condition words in fba_fnskus.condition, so the pairing is
-- recorded explicitly instead of derived from them. Pass auto-prints the
-- FNSKU paired to (unit's sku_catalog_id, unit's condition_grade).
--
-- NO BACKFILL. NULL = not paired to a grade. Legacy rows that carry only
-- sku_catalog_id (catalog backfill) stay candidates until a tech pairs them
-- explicitly. Existing writers omit the column.
--
-- SAFETY: additive, nullable, no default. fba_fnskus already carries
-- organization_id. The partial unique index ignores NULLs, so no existing
-- row can violate it. Writer: POST /api/qc/fnsku-pair, which clears the
-- previous holder of (org, sku_catalog_id, grade) in the same transaction
-- before it sets the new one.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_fba_fnskus_org_catalog_paired_grade;
--   ALTER TABLE fba_fnskus DROP COLUMN IF EXISTS paired_condition_grade;
--
-- VERIFY:
--   SELECT paired_condition_grade FROM fba_fnskus LIMIT 1;
--   \d fba_fnskus   -- uq_fba_fnskus_org_catalog_paired_grade present
-- ============================================================================

BEGIN;

ALTER TABLE fba_fnskus
  ADD COLUMN IF NOT EXISTS paired_condition_grade condition_grade_enum;

COMMENT ON COLUMN fba_fnskus.paired_condition_grade IS
  'House grade a QC pairing binds this FNSKU to (with sku_catalog_id). NULL = not paired to a grade.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fba_fnskus_org_catalog_paired_grade
  ON fba_fnskus (organization_id, sku_catalog_id, paired_condition_grade)
  WHERE paired_condition_grade IS NOT NULL AND sku_catalog_id IS NOT NULL;

COMMIT;
