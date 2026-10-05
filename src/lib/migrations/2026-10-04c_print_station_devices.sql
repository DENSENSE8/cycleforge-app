-- 2026-10-04c_print_station_devices.sql
-- Organisation print stations: enrolled computers that print with no staff
-- signed in, paused / revoked from one control plane, and a per-station log.
--
-- WHAT / WHY (handoff docs/handoff/HANDOFF-fnsku-print-station-2026-10-04.md, Phase C)
--   Owner 2026-10-04: an always-on, organisation-tied print station with no
--   staff sign-in and a solid name; one control plane to manage stations.
--   ONE device-credential pattern in the repo: the kiosk device row
--   (`kiosk_devices`: single-use pairing code → hashed device token in an
--   httpOnly cookie) gains a `kind`, and a print station's credential is a
--   `kind = 'print_station'` row. Kiosk resolution filters `kind = 'kiosk'`
--   so neither credential can act as the other.
--
--   kiosk_devices
--     kind                 'kiosk' (every existing row) | 'print_station'
--   print_stations
--     kind                 'browser' (every existing row: localStorage id,
--                          heartbeats from a staff session) | 'enrolled'
--                          (org-owned, bound to a device credential)
--     device_id            the enrolled station's kiosk_devices row
--     enrolled_by_staff_id who created it (audit only — never its identity)
--     paused_at            set: the station refuses jobs, shows Paused
--     revoked_at           set: gone from every list; an enrolled station's
--                          credential is revoked with it ("Forget" for a
--                          browser station, cleared by its next heartbeat)
--     an enrolled station needs a real name (not 'Unnamed computer'); the
--     existing ux_print_stations_org_name keeps names unique per org.
--   label_print_jobs
--     station_id           the station that printed it (per-station job log)
--
-- SAFETY GATING
--   Columns with defaults that describe every existing row (`kind`), and
--   nullable columns; no backfill, no data rewrite. All three tables are
--   already FORCE RLS; every new writer runs under withTenantTransaction /
--   tenantQuery with organization_id stamped, except the pre-auth device
--   pairing / token resolution, which uses the owner pool exactly as kiosk
--   pairing does (the code / token hash IS the capability).
--   Deploy order: apply BEFORE the code that reads `kind` (kiosk resolution
--   filters on it).
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_label_print_jobs_org_station;
--   ALTER TABLE label_print_jobs DROP COLUMN IF EXISTS station_id;
--   DROP INDEX IF EXISTS ux_print_stations_device;
--   ALTER TABLE print_stations DROP CONSTRAINT IF EXISTS print_stations_enrolled_named_chk,
--     DROP CONSTRAINT IF EXISTS print_stations_kind_chk, DROP CONSTRAINT IF EXISTS print_stations_org_enrolled_by_fk,
--     DROP COLUMN IF EXISTS revoked_at, DROP COLUMN IF EXISTS paused_at, DROP COLUMN IF EXISTS enrolled_by_staff_id,
--     DROP COLUMN IF EXISTS device_id, DROP COLUMN IF EXISTS kind;
--   ALTER TABLE kiosk_devices DROP CONSTRAINT IF EXISTS kiosk_devices_kind_chk, DROP COLUMN IF EXISTS kind;
--
-- VERIFY
--   SELECT kind, count(*) FROM kiosk_devices GROUP BY 1;     -- all 'kiosk'
--   SELECT kind, count(*) FROM print_stations GROUP BY 1;    -- all 'browser'

BEGIN;

-- ── kiosk_devices.kind ─────────────────────────────────────────────────────
ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'kiosk';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kiosk_devices_kind_chk') THEN
    ALTER TABLE kiosk_devices ADD CONSTRAINT kiosk_devices_kind_chk CHECK (kind IN ('kiosk', 'print_station'));
  END IF;
END $$;

-- ── print_stations: enrolled / paused / revoked ────────────────────────────
ALTER TABLE print_stations ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'browser';
ALTER TABLE print_stations ADD COLUMN IF NOT EXISTS device_id BIGINT REFERENCES kiosk_devices (id) ON DELETE SET NULL;
ALTER TABLE print_stations ADD COLUMN IF NOT EXISTS enrolled_by_staff_id INTEGER;
ALTER TABLE print_stations ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE print_stations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'print_stations_kind_chk') THEN
    ALTER TABLE print_stations ADD CONSTRAINT print_stations_kind_chk CHECK (kind IN ('browser', 'enrolled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'print_stations_enrolled_named_chk') THEN
    ALTER TABLE print_stations ADD CONSTRAINT print_stations_enrolled_named_chk
      CHECK (kind <> 'enrolled' OR (name <> 'Unnamed computer' AND device_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'print_stations_org_enrolled_by_fk') THEN
    ALTER TABLE print_stations ADD CONSTRAINT print_stations_org_enrolled_by_fk
      FOREIGN KEY (organization_id, enrolled_by_staff_id)
      REFERENCES staff (organization_id, id) ON DELETE SET NULL (enrolled_by_staff_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_print_stations_device
  ON print_stations (device_id) WHERE device_id IS NOT NULL;

-- ── label_print_jobs.station_id ────────────────────────────────────────────
ALTER TABLE label_print_jobs ADD COLUMN IF NOT EXISTS station_id TEXT;
CREATE INDEX IF NOT EXISTS idx_label_print_jobs_org_station
  ON label_print_jobs (organization_id, station_id, created_at DESC) WHERE station_id IS NOT NULL;

COMMENT ON COLUMN kiosk_devices.kind IS 'kiosk: a counter tablet; print_station: an enrolled print station''s credential (print_stations.device_id).';
COMMENT ON COLUMN print_stations.kind IS 'browser: a staff browser''s localStorage station; enrolled: an org-owned station bound to a device credential.';

COMMIT;
