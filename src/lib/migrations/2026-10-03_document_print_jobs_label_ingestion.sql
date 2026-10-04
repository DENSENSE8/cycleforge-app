-- 2026-10-03_document_print_jobs_label_ingestion.sql
-- The pack print bundle prints EVERY label of an order, including a
-- bulk-uploaded label already paired to the order (label_ingestions MATCHED /
-- LINKED, staged PDF, no documents row until apply). Those prints ledger in
-- document_print_jobs as document_type 'shipping_label' keyed by the ingestion
-- instead of a documents row (src/lib/documents/print-bundle.ts).
--
--   label_ingestion_id   label_ingestions.id the printed shipping label came
--                        from when it has no documents row yet.
--   source_chk           a shipping_label row names a documents row OR a label
--                        ingestion; packing_slip / manual rules unchanged.
--
-- No FK: the ledger is an immutable print history (same as product_manual_id).
--
-- Additive: one nullable column and a widened CHECK every existing row already
-- satisfies. Tenancy unchanged: document_print_jobs is FORCE-RLS
-- (2026-07-30d_document_print_jobs.sql) and every writer runs under the tenant GUC.
--
-- ROLLBACK (after deleting rows with label_ingestion_id IS NOT NULL AND document_id IS NULL):
--   ALTER TABLE document_print_jobs DROP CONSTRAINT IF EXISTS document_print_jobs_source_chk;
--   ALTER TABLE document_print_jobs ADD CONSTRAINT document_print_jobs_source_chk CHECK (
--     (document_type IN ('shipping_label', 'packing_slip') AND document_id IS NOT NULL)
--     OR (document_type = 'manual' AND (product_manual_id IS NOT NULL OR document_id IS NOT NULL)));
--   ALTER TABLE document_print_jobs DROP COLUMN IF EXISTS label_ingestion_id;

ALTER TABLE document_print_jobs ADD COLUMN IF NOT EXISTS label_ingestion_id BIGINT;

ALTER TABLE document_print_jobs DROP CONSTRAINT IF EXISTS document_print_jobs_source_chk;
ALTER TABLE document_print_jobs ADD CONSTRAINT document_print_jobs_source_chk
  CHECK (
    (document_type = 'packing_slip' AND document_id IS NOT NULL)
    OR (
      document_type = 'shipping_label'
      AND (document_id IS NOT NULL OR label_ingestion_id IS NOT NULL)
    )
    OR (
      document_type = 'manual'
      AND (product_manual_id IS NOT NULL OR document_id IS NOT NULL)
    )
  );

COMMENT ON COLUMN document_print_jobs.label_ingestion_id IS
  'label_ingestions.id of a paired (not yet applied) shipping label printed in the pack bundle; document_id is NULL for these rows.';
