-- 2026-09-28_print_station_logs.sql
-- Print logs name their print station; paperwork prints get their own log.
--
-- WHAT / WHY
--   The Labels & documents desk prints two stocks at two identified print
--   stations (labels on 4×6 at the label station, packing slips + manuals on
--   letter at the paperwork station). Printed reads both logs and says which
--   station each print went to ("Label → Thermal bench, Slip → Packing bench").
--
--   label_print_events  gains
--     station_id    the print station's stable id (`readPrintStation().id`)
--     station_name  its operator-facing name at print time
--
--   paperwork_print_events  (new) one row per paperwork document per order per
--   print batch:
--     order_id             the order the paperwork was printed for (tenant FK)
--     document_kind        packing_slip | manual
--     document_id          `documents.id` of a packing slip (tenant FK)
--     manual_id            `product_manuals.id` of a manual (no tenant key on
--                          product_manuals to reference; the writer validates it
--                          resolves for the order in this org)
--     batch_id             one Print all / Print / Reprint press (client UUID);
--                          UNIQUE NULLS NOT DISTINCT per (org, batch, order,
--                          kind, document, manual) makes a retried POST a no-op.
--                          The order is part of the key: one manual resolved by
--                          SKU for two orders prints (and logs) once per order.
--     channel              same four as label_print_events
--     printer_name, station_id, station_name, is_reprint, printed_by_staff_id,
--     printed_at           as label_print_events
--
-- SAFETY GATING
--   Additive: two nullable columns on label_print_events; paperwork_print_events
--   is tenant from birth (organization_id NOT NULL, every key and index leads
--   with it, composite tenant FKs to orders, documents and staff). Its only
--   writer (`recordPaperworkPrints`, src/lib/label-prints/print-queue.ts) runs
--   under tenantQuery with organization_id stamped explicitly, so FORCE RLS is
--   safe from the first row.
--
-- ROLLBACK
--   SELECT relax_tenant_isolation('paperwork_print_events');
--   DROP TABLE paperwork_print_events;
--   ALTER TABLE label_print_events DROP COLUMN station_name, DROP COLUMN station_id;
--
-- VERIFY
--   SELECT relforcerowsecurity FROM pg_class WHERE relname = 'paperwork_print_events';  -- t
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'label_print_events' AND column_name LIKE 'station_%';          -- 2 rows

BEGIN;

ALTER TABLE label_print_events ADD COLUMN IF NOT EXISTS station_id TEXT;
ALTER TABLE label_print_events ADD COLUMN IF NOT EXISTS station_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_print_events_station_chk') THEN
    ALTER TABLE label_print_events ADD CONSTRAINT label_print_events_station_chk
      CHECK ((station_id IS NULL OR char_length(station_id) BETWEEN 1 AND 100)
         AND (station_name IS NULL OR char_length(station_name) BETWEEN 1 AND 120));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS paperwork_print_events (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,
  order_id             INTEGER NOT NULL,
  document_kind        TEXT NOT NULL,
  document_id          INTEGER,
  manual_id            BIGINT,
  batch_id             UUID NOT NULL,
  channel              TEXT NOT NULL,
  printer_name         TEXT,
  station_id           TEXT,
  station_name         TEXT,
  is_reprint           BOOLEAN NOT NULL DEFAULT false,
  printed_by_staff_id  INTEGER,
  printed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT paperwork_print_events_org_id_uniq
    UNIQUE (organization_id, id),
  CONSTRAINT paperwork_print_events_batch_doc_uniq
    UNIQUE NULLS NOT DISTINCT (organization_id, batch_id, order_id, document_kind, document_id, manual_id),
  CONSTRAINT paperwork_print_events_org_order_fk
    FOREIGN KEY (organization_id, order_id)
    REFERENCES orders (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT paperwork_print_events_org_document_fk
    FOREIGN KEY (organization_id, document_id)
    REFERENCES documents (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT paperwork_print_events_org_staff_fk
    FOREIGN KEY (organization_id, printed_by_staff_id)
    REFERENCES staff (organization_id, id) ON DELETE SET NULL (printed_by_staff_id),
  CONSTRAINT paperwork_print_events_kind_chk
    CHECK (
      (document_kind = 'packing_slip' AND document_id IS NOT NULL AND manual_id IS NULL)
      OR (document_kind = 'manual' AND manual_id IS NOT NULL AND document_id IS NULL)
    ),
  CONSTRAINT paperwork_print_events_channel_chk
    CHECK (channel IN ('THERMAL_USB', 'THERMAL_SERIAL', 'DESKTOP_HOST', 'BROWSER_DIALOG')),
  CONSTRAINT paperwork_print_events_printer_chk
    CHECK (printer_name IS NULL OR char_length(printer_name) BETWEEN 1 AND 120),
  CONSTRAINT paperwork_print_events_station_chk
    CHECK ((station_id IS NULL OR char_length(station_id) BETWEEN 1 AND 100)
       AND (station_name IS NULL OR char_length(station_name) BETWEEN 1 AND 120))
);

CREATE INDEX IF NOT EXISTS idx_paperwork_print_events_org_order
  ON paperwork_print_events (organization_id, order_id, printed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_paperwork_print_events_org_printed
  ON paperwork_print_events (organization_id, printed_at DESC, id DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('paperwork_print_events');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — paperwork_print_events left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE paperwork_print_events IS
  'Print log of order paperwork (packing slips, manuals): one row per document per order per print batch. Reprints are new rows.';
COMMENT ON COLUMN label_print_events.station_id IS 'Print station the label went to (readPrintStation().id); null = unknown.';
COMMENT ON COLUMN label_print_events.station_name IS 'That station''s name at print time.';

COMMIT;
