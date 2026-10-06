-- ============================================================================
-- 2026-10-06c_retire_manual_document_shadows.sql (applies AFTER the deploy that removes manual-documents.ts)
--
-- WHAT: Delete the shadow copies of product manuals in `documents`
--       (`document_type = 'manual'`, `document_data->>'source' =
--       'product_manuals_promote'`) written by the 2026-07-31 backfill and by
--       the now-deleted src/lib/documents/manual-documents.ts. Their
--       `document_entity_links` SKU rows go with them (ON DELETE CASCADE).
--
-- WHY:  Operator ruling 2026-10-05 — `product_manuals` is the ONE store for
--       SKU paperwork. The shadow rows were a dual-read projection (testing
--       bundle, pack bundle, G2) that drifted from the live row on re-pair.
--       Every reader now resolves `product_manuals` directly
--       (`productPaperworkMatchSql`), and nothing writes these rows any more.
--       The `product_manuals` rows themselves are untouched.
--
-- SAFETY GATING:
--       Deletes ONLY shadow rows nothing else references. Tables that point
--       at documents and what a delete would do to them (2026-10-05 catalog):
--         document_print_jobs     ON DELETE CASCADE   — would erase print history
--         paperwork_print_events  ON DELETE CASCADE   — would erase print history
--         label_print_events      ON DELETE CASCADE   — would erase print history
--         label_ingestions        ON DELETE RESTRICT  — would abort the delete
--         scan_triage_photos      ON DELETE RESTRICT  — would abort the delete
--         shipping_label_purchases, outbound_document_ingest_jobs  SET NULL
--         document_entity_links   ON DELETE CASCADE   — intended
--       so a row referenced by any of the first five is KEPT. As of
--       2026-10-05 there are 8 shadow rows, none referenced (0 print jobs,
--       0 print events). Idempotent: a re-run finds nothing to delete.
--       Not tenant-scoped by design: a data cleanup across every org's shadow
--       rows, run as the migration owner.
--
-- ROLLBACK:
--       Re-run the promote INSERTs of 2026-07-31_document_entity_links_sku_serial_manual.sql
--       (documents rows from product_manuals + their SKU links). Only useful
--       with the pre-2026-10-05 code, which read them.
--
-- VERIFY:
--       SELECT count(*) FROM documents
--        WHERE document_type = 'manual'
--          AND document_data->>'source' = 'product_manuals_promote';
--       -- 0 (or only rows a print ledger / ingestion still references)
-- ============================================================================

DELETE FROM documents d
 WHERE d.document_type = 'manual'
   AND d.document_data->>'source' = 'product_manuals_promote'
   AND NOT EXISTS (SELECT 1 FROM document_print_jobs j WHERE j.document_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM paperwork_print_events e WHERE e.document_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM label_print_events e WHERE e.document_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM label_ingestions li WHERE li.document_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM scan_triage_photos p WHERE p.document_id = d.id);
