-- 2026-10-06b_print_files.sql
-- Labels & docs › Bulk is a FILE list: one row per uploaded PDF (label_batches),
-- the original PDF kept for preview, and each Letter-class page a packing slip
-- that remembers the file and page it came from.
--
-- WHAT / WHY
--   Operator 2026-10-06: an upload is one file, newest first, previewed as the
--   ORIGINAL PDF. Each page is classified by its size: 4×6-class pages stay
--   label ingestions (label_ingestions.batch_id / page_number, unchanged);
--   every other page is stored as a one-page `packing_slip` document that the
--   file must find again (preview order, print order, print status, delete).
--
--   label_batches.original_storage_provider / original_bucket / original_object_key
--                            where the uploaded bytes live (GCS). Nullable: a
--                            batch uploaded before this migration has no stored
--                            original; its content route answers 404 and a
--                            re-upload of the same bytes stores it.
--
--   documents.upload_batch_id / upload_page_number
--                            the file (label_batches.id) and 1-based page a
--                            paperwork page came from. A deleted file leaves its
--                            linked pages as plain slips (tenant FK,
--                            ON DELETE SET NULL (upload_batch_id)).
--
-- SAFETY GATING
--   Additive nullable columns only; no backfill, no default rewrite. The only
--   writer (`uploadLabelBatch`, src/lib/label-batches/batches.ts) stamps them
--   under tenantQuery / withTenantTransaction with organization_id explicit.
--   label_batches and documents keep their existing RLS state. Code that reads
--   the columns ships with this migration — apply before that code serves.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_documents_org_upload_batch;
--   ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_upload_page_number_chk;
--   ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_org_upload_batch_fk;
--   ALTER TABLE documents DROP COLUMN IF EXISTS upload_page_number;
--   ALTER TABLE documents DROP COLUMN IF EXISTS upload_batch_id;
--   ALTER TABLE label_batches DROP COLUMN IF EXISTS original_object_key;
--   ALTER TABLE label_batches DROP COLUMN IF EXISTS original_bucket;
--   ALTER TABLE label_batches DROP COLUMN IF EXISTS original_storage_provider;
--
-- VERIFY
--   SELECT column_name FROM information_schema.columns
--    WHERE (table_name = 'label_batches' AND column_name LIKE 'original_%')
--       OR (table_name = 'documents' AND column_name LIKE 'upload_%');      -- 5 rows
--   SELECT conname FROM pg_constraint WHERE conname = 'documents_org_upload_batch_fk';  -- 1 row

BEGIN;

ALTER TABLE label_batches ADD COLUMN IF NOT EXISTS original_storage_provider TEXT;
ALTER TABLE label_batches ADD COLUMN IF NOT EXISTS original_bucket TEXT;
ALTER TABLE label_batches ADD COLUMN IF NOT EXISTS original_object_key TEXT;

COMMENT ON COLUMN label_batches.original_object_key IS
  'Object key of the uploaded PDF as uploaded (preview); null for batches uploaded before 2026-10-06.';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_batch_id BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_page_number INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_org_upload_batch_fk') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_org_upload_batch_fk
      FOREIGN KEY (organization_id, upload_batch_id)
      REFERENCES label_batches (organization_id, id) ON DELETE SET NULL (upload_batch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_upload_page_number_chk') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_upload_page_number_chk
      CHECK (upload_page_number IS NULL OR upload_page_number >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_org_upload_batch
  ON documents (organization_id, upload_batch_id)
  WHERE upload_batch_id IS NOT NULL;

COMMENT ON COLUMN documents.upload_batch_id IS
  'The uploaded file (label_batches.id) this paperwork page was split from; null for every other document.';

COMMIT;
