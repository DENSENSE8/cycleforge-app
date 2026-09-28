-- 2026-09-28s_print_stations.sql
-- The org's print-station registry: every computer that can print, and which
-- one prints each stock for the whole org.
--
-- WHAT / WHY
--   A print station is one browser (`readPrintStation().id`, minted in its
--   localStorage) with a label and/or paper printer paired. Until now a
--   station was only visible to the staffer signed in on it (the per-staff
--   Ably bridge roster). The Labels & documents desk sends labels and
--   paperwork to a NAMED station for anyone in the org, so stations announce
--   themselves here and the org assigns one station per stock.
--
--   print_stations  one row per (org, station)
--     station_id          the browser's stable station id (ps_<uuid>)
--     name                the operator-facing name at the last heartbeat
--     label_ready / paper_ready
--                         that stock would silent-print right now
--     label_printer / paper_printer
--                         the routed printer's name, when known
--     last_seen_at        the last heartbeat (server clock); online = seen
--                         within STAFF_PRINT_STATION_STALE_MS (40 s)
--     last_seen_staff_id  who was signed in on it then
--     assigned_label / assigned_paper
--                         the org's default station for that stock; a partial
--                         unique index keeps at most one per org per stock.
--                         Heartbeats never touch these; a staffer's per-device
--                         pick overrides them client-side.
--
-- SAFETY GATING
--   New table, tenant from birth: organization_id NOT NULL, every key and
--   index leads with it, composite tenant FK to staff. The only writers
--   (`recordPrintStationHeartbeat`, `setPrintStationAssignment`,
--   src/lib/print/print-station-registry.ts) run under tenantQuery /
--   withTenantTransaction with organization_id stamped explicitly, so FORCE
--   RLS is safe from the first row.
--
-- ROLLBACK
--   SELECT relax_tenant_isolation('print_stations');
--   DROP TABLE print_stations;
--
-- VERIFY
--   SELECT relforcerowsecurity FROM pg_class WHERE relname = 'print_stations';  -- t

BEGIN;

CREATE TABLE IF NOT EXISTS print_stations (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  station_id          TEXT NOT NULL,
  name                TEXT NOT NULL,
  label_ready         BOOLEAN NOT NULL DEFAULT false,
  paper_ready         BOOLEAN NOT NULL DEFAULT false,
  label_printer       TEXT,
  paper_printer       TEXT,
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_staff_id  INTEGER,
  assigned_label      BOOLEAN NOT NULL DEFAULT false,
  assigned_paper      BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT print_stations_org_id_uniq
    UNIQUE (organization_id, id),
  CONSTRAINT print_stations_org_station_uniq
    UNIQUE (organization_id, station_id),
  CONSTRAINT print_stations_org_staff_fk
    FOREIGN KEY (organization_id, last_seen_staff_id)
    REFERENCES staff (organization_id, id) ON DELETE SET NULL (last_seen_staff_id),
  CONSTRAINT print_stations_station_chk
    CHECK (char_length(station_id) BETWEEN 1 AND 100 AND char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT print_stations_printer_chk
    CHECK ((label_printer IS NULL OR char_length(label_printer) BETWEEN 1 AND 120)
       AND (paper_printer IS NULL OR char_length(paper_printer) BETWEEN 1 AND 120))
);

CREATE UNIQUE INDEX IF NOT EXISTS print_stations_one_label_station
  ON print_stations (organization_id) WHERE assigned_label;
CREATE UNIQUE INDEX IF NOT EXISTS print_stations_one_paper_station
  ON print_stations (organization_id) WHERE assigned_paper;
CREATE INDEX IF NOT EXISTS idx_print_stations_org_seen
  ON print_stations (organization_id, last_seen_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('print_stations');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — print_stations left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE print_stations IS
  'Org print-station registry: one row per station (browser), upserted by its heartbeat; assigned_* mark the org default station per stock.';

COMMIT;
