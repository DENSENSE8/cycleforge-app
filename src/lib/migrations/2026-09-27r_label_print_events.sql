-- 2026-09-27r_label_print_events.sql
-- The print log of the label ledger: one row per label per print batch.
--
-- WHAT / WHY
--   The Labels & documents desk (`/shipping/label-intake`) bulk-prints every
--   label in `label_ingestions` — paired to an order or not (dogfood prints
--   ShipStation labels with no order pairing). "Pending" is a label with no
--   print row; "Record" is the log below, and a reprint is a new row with
--   is_reprint = true. Printing never changes the ingestion itself:
--   label_ingestions keeps its lifecycle (APPLIED stays terminal, row_version
--   stays the apply-concurrency token), so the log lives beside it.
--
--   label_print_events
--     label_ingestion_id   the printed label (tenant FK, cascades with it)
--     batch_id             one Print all / Print / Reprint press (client UUID);
--                          UNIQUE per (org, batch, label) makes a retried POST
--                          a no-op instead of a second print row
--     channel              how the job left the browser:
--                            THERMAL_USB / THERMAL_SERIAL  raw raster to a paired
--                                                          thermal printer (silent)
--                            DESKTOP_HOST                  Electron / Tauri shell
--                                                          silent print (N1)
--                            BROWSER_DIALOG                the browser's print dialog
--     printer_name         operator-facing printer name when known
--     is_reprint           true when the label already had a print row
--     printed_by_staff_id  the signed-in staffer (server-owned, never client input)
--
-- SAFETY GATING
--   New table, tenant from birth: organization_id NOT NULL, every key and
--   index leads with it, composite tenant FKs to label_ingestions and staff.
--   The only writer (`recordLabelPrints`, src/lib/label-prints/print-queue.ts)
--   runs under tenantQuery with organization_id stamped explicitly, so FORCE
--   RLS is safe from the first row.
--
-- ROLLBACK
--   SELECT relax_tenant_isolation('label_print_events');
--   DROP TABLE label_print_events;
--
-- VERIFY
--   SELECT relforcerowsecurity FROM pg_class WHERE relname = 'label_print_events';  -- t

BEGIN;

CREATE TABLE IF NOT EXISTS label_print_events (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,
  label_ingestion_id   BIGINT NOT NULL,
  batch_id             UUID NOT NULL,
  channel              TEXT NOT NULL,
  printer_name         TEXT,
  is_reprint           BOOLEAN NOT NULL DEFAULT false,
  printed_by_staff_id  INTEGER,
  printed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT label_print_events_org_id_uniq
    UNIQUE (organization_id, id),
  CONSTRAINT label_print_events_batch_label_uniq
    UNIQUE (organization_id, batch_id, label_ingestion_id),
  CONSTRAINT label_print_events_org_ingestion_fk
    FOREIGN KEY (organization_id, label_ingestion_id)
    REFERENCES label_ingestions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT label_print_events_org_staff_fk
    FOREIGN KEY (organization_id, printed_by_staff_id)
    REFERENCES staff (organization_id, id) ON DELETE SET NULL (printed_by_staff_id),
  CONSTRAINT label_print_events_channel_chk
    CHECK (channel IN ('THERMAL_USB', 'THERMAL_SERIAL', 'DESKTOP_HOST', 'BROWSER_DIALOG')),
  CONSTRAINT label_print_events_printer_chk
    CHECK (printer_name IS NULL OR char_length(printer_name) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_label_print_events_org_ingestion
  ON label_print_events (organization_id, label_ingestion_id, printed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_label_print_events_org_printed
  ON label_print_events (organization_id, printed_at DESC, id DESC);

SELECT enforce_tenant_isolation('label_print_events');

COMMENT ON TABLE label_print_events IS
  'Print log of the label ledger: one row per label per print batch. Pending = no row; reprints are new rows.';

COMMIT;
