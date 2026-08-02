-- ============================================================================
-- 2026-08-01d_kit_part_reference_document.sql
--
-- A kit part may carry a REFERENCE DOCUMENT — the paper that physically goes in
-- the box (a warranty card, a quick-start guide, a compliance insert).
--
-- Ruled 2026-08-01 (docs/todo/step-document-reveal-RULING.md). The operator's
-- question at the pack bench is "WHICH of these papers goes in this box", and
-- `sku_kit_parts` already answers "what goes in the box" — the insert was
-- always a critical kit part with nothing attached to it. This adds the
-- attachment, and nothing else: no new step kind, no second checklist.
--
-- WHY NOT AN FK. Three existing tables look like candidate parents and none is:
--
--   documents        — a SIGNED-AGREEMENT store (signature_url, signer_name,
--                      signed_at). An unsigned printable insert is not that.
--   product_manuals  — per SKU / item_number, one active row, Google-Drive
--                      backed. That is "the manual FOR this SKU". A kit part is
--                      a finer grain: one SKU's box can hold two different
--                      papers, and the same warranty card rides in many SKUs.
--   photos           — evidence of what happened, not a thing to print.
--
-- Inventing an FK to the nearest-looking one would put the wrong grain in the
-- schema to save three nullable columns. When a real org-wide insert library
-- exists, `document_url` becomes the projection of its row and this migration's
-- columns are where it lands.
--
-- WHY A URL AND NOT A DOCUMENT ID — this is a PERMISSION constraint, not a
-- convenience. `packing.*` is its own permission category
-- (src/lib/auth/permission-registry.ts), so a packer holding
-- packing.scan_order need not hold orders.view — and /api/documents/:id/content
-- requires orders.view. A packer resolving bytes through that proxy would 403
-- at the bench. The column therefore holds a DIRECTLY FETCHABLE url (a Vercel
-- Blob url), which is the same rule the tech bench already follows for manuals
-- at tech.qc_pass.
--
-- NO BACKFILL, and every column NULLABLE. A part with no document is the
-- overwhelming majority and must render byte-identically to today — the pack
-- checklist's row anatomy does not change for it. There is no default to
-- invent: "this part has an insert" is a fact somebody has to state.
--
-- Tenant: sku_kit_parts is already org-scoped (organization_id added
-- 2026-05-23) and already FORCE-RLS'd (2026-06-22_enforce_tenant_isolation_
-- ready_cohort.sql). Adding columns to it inherits both — no new
-- enforce_tenant_isolation() call, and adding one would be a no-op re-install.
-- ============================================================================

BEGIN;

ALTER TABLE sku_kit_parts
  ADD COLUMN IF NOT EXISTS document_url   TEXT,
  ADD COLUMN IF NOT EXISTS document_title TEXT,
  ADD COLUMN IF NOT EXISTS document_mime  TEXT;

COMMENT ON COLUMN sku_kit_parts.document_url IS
  'Directly-fetchable url (Vercel Blob) for the insert that goes in the box. NEVER an /api/documents/:id/content path — packing.* does not imply orders.view.';
COMMENT ON COLUMN sku_kit_parts.document_title IS
  'Operator-facing name of the insert. Falls back to component_name when null.';
COMMENT ON COLUMN sku_kit_parts.document_mime IS
  'Render hint for DocumentPreviewFrame: pdf | image | unknown. Null lets the client sniff the url.';

-- Mirrors DocumentPreviewMimeHint (src/design-system/components/document-preview-mime.ts).
-- A value outside this set would render as an empty viewer with no error.
DO $$ BEGIN
  ALTER TABLE sku_kit_parts ADD CONSTRAINT sku_kit_parts_document_mime_chk
    CHECK (document_mime IS NULL OR document_mime IN ('pdf', 'image', 'unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A title or a mime without a url is a half-declared document: the bench would
-- show a named insert that cannot open. Cheaper to reject than to branch on.
DO $$ BEGIN
  ALTER TABLE sku_kit_parts ADD CONSTRAINT sku_kit_parts_document_url_required_chk
    CHECK (
      document_url IS NOT NULL
      OR (document_title IS NULL AND document_mime IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partial: only document-bearing parts are ever looked up this way, and they
-- are the small minority of the table.
CREATE INDEX IF NOT EXISTS idx_sku_kit_parts_with_document
  ON sku_kit_parts (organization_id, sku_catalog_id)
  WHERE document_url IS NOT NULL;

COMMIT;
