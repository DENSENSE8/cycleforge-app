-- 2026-09-28t_label_batches.sql
-- Label batches: one uploaded multi-page label PDF, its pages = label ingestions.
-- Plus: print-station names unique per org (case-insensitive).
--
-- WHAT / WHY
--   The Labels & docs desk (`/shipping/label-intake`) lands on Uploads — one
--   card per uploaded PDF. The server splits the PDF into single-page PDFs and
--   ingests each page through the ordinary label ingestion path
--   (`createLabelIngestion`), so every page is a normal `label_ingestions` row
--   (pairing, print log, Labels view unchanged). The original PDF is not stored.
--
--   label_batches
--     file_name              the uploaded file's name
--     sha256                 of the uploaded bytes; UNIQUE per org — the same
--                            PDF uploaded twice IS the same batch (its history
--                            carries over; a re-upload ingests nothing)
--     page_count / byte_size of the uploaded PDF
--     uploaded_by_staff_id   the signed-in staffer (server-owned)
--     uploaded_at            server clock
--
--   label_ingestions.batch_id / page_number
--                            the batch a page came from and its 1-based page;
--                            a deleted batch leaves its pages as plain labels
--                            (tenant FK, ON DELETE SET NULL (batch_id))
--
--   print_stations: partial UNIQUE (organization_id, lower(name)) excluding the
--   'Unnamed computer' placeholder — two named stations never share a name
--   (the picker could not tell them apart). `renamePrintStation` pre-checks and
--   maps a racing 23505 to the same 409. Verified 2026-09-28: no named
--   duplicates in the dev DB (no named stations at all).
--
-- SAFETY GATING
--   label_batches is a new table, tenant from birth: organization_id NOT NULL,
--   every key and index leads with it, composite tenant FKs to staff and from
--   label_ingestions. The only writer (`uploadLabelBatch`,
--   src/lib/label-batches/batches.ts) runs under withTenantTransaction /
--   tenantQuery with organization_id stamped explicitly, so FORCE RLS is safe
--   from the first row. The label_ingestions columns are nullable additions;
--   label_ingestions is already FORCE-RLS.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS ux_print_stations_org_name;
--   DROP INDEX IF EXISTS idx_label_ingestions_org_batch_page;
--   ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_org_batch_fk;
--   ALTER TABLE label_ingestions DROP COLUMN IF EXISTS page_number;
--   ALTER TABLE label_ingestions DROP COLUMN IF EXISTS batch_id;
--   SELECT relax_tenant_isolation('label_batches');
--   DROP TABLE label_batches;
--
-- VERIFY
--   SELECT relforcerowsecurity FROM pg_class WHERE relname = 'label_batches';  -- t

BEGIN;

CREATE TABLE IF NOT EXISTS label_batches (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       UUID NOT NULL,
  file_name             TEXT NOT NULL,
  sha256                VARCHAR(64) NOT NULL,
  page_count            INTEGER NOT NULL,
  byte_size             BIGINT NOT NULL,
  uploaded_by_staff_id  INTEGER,
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT label_batches_org_id_uniq
    UNIQUE (organization_id, id),
  CONSTRAINT label_batches_org_sha256_uniq
    UNIQUE (organization_id, sha256),
  CONSTRAINT label_batches_org_staff_fk
    FOREIGN KEY (organization_id, uploaded_by_staff_id)
    REFERENCES staff (organization_id, id) ON DELETE SET NULL (uploaded_by_staff_id),
  CONSTRAINT label_batches_sha256_chk
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT label_batches_file_name_chk
    CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT label_batches_page_count_chk
    CHECK (page_count >= 1),
  CONSTRAINT label_batches_byte_size_chk
    CHECK (byte_size > 0)
);

CREATE INDEX IF NOT EXISTS idx_label_batches_org_uploaded
  ON label_batches (organization_id, uploaded_at DESC, id DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('label_batches');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — label_batches left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE label_batches IS
  'One uploaded label PDF; its pages are label_ingestions rows (batch_id, page_number). Same bytes = same batch.';

ALTER TABLE label_ingestions ADD COLUMN IF NOT EXISTS batch_id BIGINT;
ALTER TABLE label_ingestions ADD COLUMN IF NOT EXISTS page_number INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_ingestions_org_batch_fk') THEN
    ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_org_batch_fk
      FOREIGN KEY (organization_id, batch_id)
      REFERENCES label_batches (organization_id, id) ON DELETE SET NULL (batch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_ingestions_page_number_chk') THEN
    ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_page_number_chk
      CHECK (page_number IS NULL OR page_number >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_label_ingestions_org_batch_page
  ON label_ingestions (organization_id, batch_id, page_number)
  WHERE batch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_print_stations_org_name
  ON print_stations (organization_id, lower(name))
  WHERE name <> 'Unnamed computer';

COMMIT;
