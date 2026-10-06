-- 2026-10-04_bulk_print_events_any_document.sql
-- Print logs accept every physical document Labels & docs › Bulk can print.
--
-- WHAT / WHY
--   Bulk prints one canonical row per physical document (src/lib/label-prints/
--   bulk-contracts.ts). Two of them could not be logged, so they read
--   "Unprinted" forever after printing:
--
--   1. A shipping label stored only as a `documents` row (uploaded straight to
--      an order, ShipStation history, marketplace) has no label ingestion, and
--      label_print_events required `label_ingestion_id`.
--        label_print_events  gains  document_id  (tenant FK to documents)
--                            label_ingestion_id becomes nullable
--                            CHECK one of the two is set
--                            UNIQUE (org, batch, document) for document-only rows,
--                            so a retried POST stays a no-op like the ingestion key.
--
--   2. An unpaired packing slip (Bulk upload, no order yet) has no order, and
--      paperwork_print_events required `order_id`.
--        paperwork_print_events  order_id becomes nullable. The existing
--                            UNIQUE NULLS NOT DISTINCT (org, batch, order, kind,
--                            document, manual) already dedupes a NULL order.
--                            The kind CHECK is unchanged: a manual still needs
--                            its order (the writer resolves manuals per order).
--
-- SAFETY GATING
--   Relaxing + additive only. Existing writers (recordLabelPrints,
--   recordPaperworkPrints in src/lib/label-prints/print-queue.ts) keep stamping
--   organization_id and every value they stamp today; both tables already run
--   FORCE RLS. Readers that join on label_ingestion_id / order_id simply do not
--   match the new NULL rows.
--
-- ROLLBACK
--   DELETE FROM label_print_events WHERE label_ingestion_id IS NULL;
--   DELETE FROM paperwork_print_events WHERE order_id IS NULL;
--   DROP INDEX IF EXISTS label_print_events_batch_document_uniq;
--   ALTER TABLE label_print_events DROP CONSTRAINT IF EXISTS label_print_events_subject_chk,
--     DROP CONSTRAINT IF EXISTS label_print_events_org_document_fk,
--     DROP COLUMN IF EXISTS document_id,
--     ALTER COLUMN label_ingestion_id SET NOT NULL;
--   ALTER TABLE paperwork_print_events ALTER COLUMN order_id SET NOT NULL;
--
-- VERIFY
--   \d label_print_events  — document_id bigint, label_ingestion_id nullable
--   \d paperwork_print_events — order_id nullable

ALTER TABLE label_print_events ADD COLUMN IF NOT EXISTS document_id INTEGER;
ALTER TABLE label_print_events ALTER COLUMN label_ingestion_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_print_events_org_document_fk') THEN
    ALTER TABLE label_print_events
      ADD CONSTRAINT label_print_events_org_document_fk
      FOREIGN KEY (organization_id, document_id) REFERENCES documents(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_print_events_subject_chk') THEN
    ALTER TABLE label_print_events
      ADD CONSTRAINT label_print_events_subject_chk
      CHECK (label_ingestion_id IS NOT NULL OR document_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS label_print_events_batch_document_uniq
  ON label_print_events (organization_id, batch_id, document_id)
  WHERE label_ingestion_id IS NULL;

CREATE INDEX IF NOT EXISTS label_print_events_org_document_idx
  ON label_print_events (organization_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE paperwork_print_events ALTER COLUMN order_id DROP NOT NULL;
