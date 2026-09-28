-- 2026-09-28u_qc_procedure_versions.sql
-- Versioned QC procedures. A procedure is the published checklist of one scope —
-- a SKU (qc_check_templates.sku_catalog_id) or a category (qc_check_templates.category
-- with no SKU). Publishing freezes the scope's live published steps into an
-- immutable qc_procedure_versions row (version = previous + 1, supersedes_id =
-- previous), and each unit checklist answer records the version it was answered
-- against (tech_verifications.procedure_version_id).
--
-- Why on qc_check_templates and not checklist_templates: the unit checklist run
-- (/api/serial-units/[id]/checklist + /bulk) executes qc_check_templates steps;
-- checklist_templates holds only the org-wide receiving checklist (GLOBAL scope,
-- no SKU/category rows). Versioning what a unit run never executes would record
-- nothing true. The scope model (SKU | CATEGORY) mirrors checklist_templates'.
--
--   qc_procedure_versions   tenant-owned; steps = jsonb snapshot (shape below, the
--                           same object the API returns as QcProcedureStep).
--   qc_procedure_live_steps(org, sku_catalog_id, category) — the ONE definition of
--                           the snapshot shape: the scope's live 'published' steps,
--                           ordered. Publishing and drift checks (src/lib/qc/procedures.ts)
--                           compare/insert exactly this, so a version equals what ran.
--   tech_verifications.procedure_version_id — nullable; answers recorded before this
--                           migration stay NULL (their definition was never frozen).
--
-- Seed: every scope that has published steps today gets version 1 (the baseline in
-- force when versioning began), so the next checklist answer records a version.
--
-- SAFETY: new table is tenant-from-birth + enforced. Its only writer
-- (src/lib/qc/procedures.ts) runs inside withTenantTransaction and stamps
-- organization_id explicitly. The seed runs as the migration owner with explicit
-- organization_id from qc_check_templates. tech_verifications is already enforced;
-- the new column is nullable with no default.
--
-- ROLLBACK:
--   ALTER TABLE tech_verifications DROP COLUMN IF EXISTS procedure_version_id;
--   DROP FUNCTION IF EXISTS qc_procedure_live_steps(uuid, integer, text);
--   select relax_tenant_isolation('qc_procedure_versions');
--   DROP TABLE IF EXISTS qc_procedure_versions;
--
-- VERIFY:
--   select count(*), count(distinct coalesce(sku_catalog_id::text, category)) from qc_procedure_versions;
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'qc_procedure_versions';

CREATE TABLE IF NOT EXISTS qc_procedure_versions (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  sku_catalog_id  INTEGER REFERENCES sku_catalog(id) ON DELETE CASCADE,
  category        TEXT,
  version         INTEGER NOT NULL,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by    INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  supersedes_id   BIGINT REFERENCES qc_procedure_versions(id) ON DELETE SET NULL,
  steps           JSONB NOT NULL,
  notes           TEXT,
  CONSTRAINT qc_procedure_versions_scope_check
    CHECK ((sku_catalog_id IS NOT NULL) <> (category IS NOT NULL)),
  CONSTRAINT qc_procedure_versions_version_check CHECK (version > 0),
  CONSTRAINT qc_procedure_versions_steps_array CHECK (jsonb_typeof(steps) = 'array')
);

-- Per-org, per-scope version numbers; also the "latest version" lookup (backward scan).
CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_procedure_versions_sku
  ON qc_procedure_versions (organization_id, sku_catalog_id, version)
  WHERE sku_catalog_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_procedure_versions_category
  ON qc_procedure_versions (organization_id, category, version)
  WHERE category IS NOT NULL;

CREATE OR REPLACE FUNCTION qc_procedure_live_steps(p_org UUID, p_sku_catalog_id INTEGER, p_category TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'stepId',        qc.id,
               'stepLabel',     qc.step_label,
               'stepType',      qc.step_type,
               'sortOrder',     qc.sort_order,
               'valueKind',     qc.value_kind,
               'valueUnit',     qc.value_unit,
               'valueEnum',     qc.value_enum,
               'passMin',       qc.pass_min,
               'passMax',       qc.pass_max,
               'failureModeId', qc.failure_mode_id
             ) ORDER BY qc.sort_order, qc.id),
           '[]'::jsonb)
    FROM qc_check_templates qc
   WHERE qc.organization_id = p_org
     AND qc.status = 'published'
     AND (
          (p_sku_catalog_id IS NOT NULL AND qc.sku_catalog_id = p_sku_catalog_id)
       OR (p_sku_catalog_id IS NULL AND qc.sku_catalog_id IS NULL AND qc.category = p_category)
     )
$$;

ALTER TABLE tech_verifications
  ADD COLUMN IF NOT EXISTS procedure_version_id BIGINT REFERENCES qc_procedure_versions(id) ON DELETE SET NULL;

-- "Which units were checked against version N".
CREATE INDEX IF NOT EXISTS idx_tech_verifications_procedure_version
  ON tech_verifications (procedure_version_id)
  WHERE procedure_version_id IS NOT NULL;

-- Baseline v1 per scope with published steps.
INSERT INTO qc_procedure_versions (organization_id, sku_catalog_id, category, version, steps, notes)
SELECT s.organization_id, s.sku_catalog_id, s.category, 1,
       qc_procedure_live_steps(s.organization_id, s.sku_catalog_id, s.category),
       'Baseline — steps in force when procedure versioning began'
  FROM (
    SELECT DISTINCT organization_id, sku_catalog_id,
           CASE WHEN sku_catalog_id IS NULL THEN category END AS category
      FROM qc_check_templates
     WHERE status = 'published'
  ) s
 WHERE NOT EXISTS (
   SELECT 1 FROM qc_procedure_versions v
    WHERE v.organization_id = s.organization_id
      AND v.sku_catalog_id IS NOT DISTINCT FROM s.sku_catalog_id
      AND v.category IS NOT DISTINCT FROM s.category
 );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('qc_procedure_versions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — qc_procedure_versions left without FORCE RLS';
  END IF;
END $$;
