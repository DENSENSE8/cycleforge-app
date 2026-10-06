-- ============================================================================
-- 2026-10-05_label_manifests_label_face.sql
--
-- WHAT: label_manifests.label_face — the hand-edited QC label face of a
-- package: {"title": text|null, "color": text|null, "text": text|null}.
--
-- WHY: prepack lets the operator override the label title, color and add a
-- custom line per package. A print station only receives the scan key and
-- rebuilds the face from the database (findQcLabelPrintUnit), so the face must
-- persist on the labelled thing. A one-unit package keeps it on
-- serial_units.metadata->'qc_label' (existing jsonb); a package of 2+ serials
-- is labelled by its PREBOX manifest, which had no jsonb column.
--
-- NULL = default face (product title, no color, no custom line). Prepack
-- Finish is the only writer; an all-null face is stored as NULL.
--
-- SAFETY: additive, nullable, no default; existing writers omit the column.
-- label_manifests already carries organization_id with tenant isolation.
-- IF NOT EXISTS makes a re-run a no-op.
--
-- ROLLBACK:
--   ALTER TABLE label_manifests DROP COLUMN IF EXISTS label_face;
--
-- VERIFY:
--   \d+ label_manifests                 -- label_face jsonb, nullable
-- ============================================================================

BEGIN;

ALTER TABLE label_manifests ADD COLUMN IF NOT EXISTS label_face JSONB;

COMMENT ON COLUMN label_manifests.label_face IS
  'Hand-edited QC label face {title,color,text} (each text or null); NULL = default face. Written by prepack Finish, read by findQcLabelPrintUnit.';

COMMIT;
