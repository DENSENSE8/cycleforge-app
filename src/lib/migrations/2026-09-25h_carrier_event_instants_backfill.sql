-- ============================================================================
-- 2026-09-25h — carrier event instants: recompute from the stored payload
-- ============================================================================
--
-- WHAT
--   1. shipment_tracking_events.event_occurred_at is recomputed from each
--      event's own `payload` with the same precedence as the fixed parsers
--      (src/lib/shipping/carrier-event-instant.ts):
--        UPS   gmtDate+gmtTime (UTC) → date+time at gmtOffset → date+time in
--              America/Los_Angeles.
--        FEDEX payload.date as given when it carries Z/offset → a bare wall
--              clock (the date-only "…T00:00:00" pickups) in
--              America/Los_Angeles.
--        USPS  GMTTimestamp (UTC) → eventTimestamp at GMTOffset →
--              eventTimestamp in America/Los_Angeles. USPS external_event_id
--              is rewritten to the parser's `<code>:<ISO instant>` (it was
--              `<code>:x` because the old parser read fields v3 never sends).
--      Rows whose payload yields no instant are left untouched.
--   2. shipping_tracking_numbers milestones are recomputed from the corrected
--      event log for every shipment that has timed events — the same
--      derivation updateShipmentSummary now runs on each sync:
--        label_created_at   ← first LABEL_CREATED scan
--        carrier_accepted_at← first ACCEPTED scan
--        first_in_transit_at← first IN_TRANSIT scan
--        out_for_delivery_at← latest OUT_FOR_DELIVERY scan
--        delivered_at       ← first DELIVERED scan
--        exception_at       ← latest EXCEPTION scan
--        latest_event_at    ← latest scan
--      A milestone with no backing event keeps its current value (never
--      nulled); the NOTICE at the end counts those per column.
--
-- WHY
--   The UPS parser built event_occurred_at from the LOCAL activity date/time
--   as if it were UTC (1Z23A1E90339190802: local 11:40:34 at -07:00 stored as
--   11:40:34Z instead of 18:40:34Z). FedEx date-only pickups were read in the
--   sync host's zone (69 rows at 00:00Z, 57 at 07/08Z — whichever box ran).
--   USPS v3 events stored no instant at all. And STN milestones were stamped
--   with the sync's now(), not the carrier's scan time.
--
-- SAFETY
--   * Recompute-from-payload is a pure function of immutable columns → rerun
--     changes nothing (idempotent). The backup insert is ON CONFLICT DO
--     NOTHING, so the FIRST run's original values are what is kept.
--   * Dedupe key uq_events_dedupe = (shipment_id, external_event_id,
--     external_status_code, event_occurred_at). UPS/FedEx external_event_id is
--     unchanged (the parser keeps the legacy stamp as identity), so after this
--     runs the next sync hits the same key → ON CONFLICT DO NOTHING, no
--     duplicates. If the fixed parser synced BEFORE this migration, a
--     corrected twin row already holds the target key: the stale row is
--     backed up and deleted (never both kept, never a unique violation).
--   * Time zones are explicit everywhere (offset literals / AT TIME ZONE), so
--     the result does not depend on the session TimeZone of the runner.
--   * Casts go through pg_temp helpers that return NULL instead of raising, so
--     one malformed payload cannot abort the run.
--   * The runner connects as neondb_owner (BYPASSRLS) — FORCE RLS on both
--     tables does not hide rows from it.
--   * carrier_event_time_backup_2026_09_25 is a deliberately UNSCOPED
--     ops-restore table (no organization_id / RLS): it is never read by the
--     app, and each snapshot row carries its own organization_id in `snapshot`.
--     Drop it once the rollback window closes.
--
-- ROLLBACK
--   BEGIN;
--   -- events that were retimed / re-identified
--   UPDATE shipment_tracking_events e
--      SET event_occurred_at = (b.snapshot->>'event_occurred_at')::timestamptz,
--          external_event_id = b.snapshot->>'external_event_id'
--     FROM carrier_event_time_backup_2026_09_25 b
--    WHERE b.kind = 'event' AND b.row_id = e.id;
--   -- stale twins that were deleted
--   INSERT INTO shipment_tracking_events
--   SELECT (jsonb_populate_record(NULL::shipment_tracking_events, b.snapshot)).*
--     FROM carrier_event_time_backup_2026_09_25 b
--    WHERE b.kind = 'event_deleted'
--   ON CONFLICT DO NOTHING;
--   -- shipment milestones
--   UPDATE shipping_tracking_numbers s
--      SET label_created_at    = (b.snapshot->>'label_created_at')::timestamptz,
--          carrier_accepted_at = (b.snapshot->>'carrier_accepted_at')::timestamptz,
--          first_in_transit_at = (b.snapshot->>'first_in_transit_at')::timestamptz,
--          out_for_delivery_at = (b.snapshot->>'out_for_delivery_at')::timestamptz,
--          delivered_at        = (b.snapshot->>'delivered_at')::timestamptz,
--          exception_at        = (b.snapshot->>'exception_at')::timestamptz,
--          latest_event_at     = (b.snapshot->>'latest_event_at')::timestamptz
--     FROM carrier_event_time_backup_2026_09_25 b
--    WHERE b.kind = 'shipment' AND b.row_id = s.id;
--   COMMIT;
--   (Roll the parser back too, or the next sync re-inserts corrected twins.)
--
-- VERIFY
--   SELECT event_occurred_at FROM shipment_tracking_events
--    WHERE shipment_id = 43308 AND external_status_code = 'MP';
--   -- lane: 2026-07-23 18:40:34+00
--
-- KNOWN LIMITS
--   * The legacy USPS "March 9, 2025" + "8:00 am" shape is parsed only by the
--     app (no stored row uses it).
--   * A zone-less wall clock inside the fall-back DST hour is ambiguous; PG
--     and date-fns-tz may pick different sides of it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS carrier_event_time_backup_2026_09_25 (
  kind         TEXT        NOT NULL CHECK (kind IN ('event', 'event_deleted', 'shipment')),
  row_id       BIGINT      NOT NULL,
  snapshot     JSONB       NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, row_id)
);

-- Safe casts: NULL instead of an aborted migration on a malformed stamp.
-- `cei_tstz` is ONLY called with text that carries an explicit zone/offset.
CREATE OR REPLACE FUNCTION pg_temp.cei_tstz(txt TEXT) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN txt::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.cei_wall(txt TEXT, offs TEXT) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF offs IS NOT NULL THEN
    RETURN (txt || offs)::timestamptz;
  END IF;
  RETURN txt::timestamp AT TIME ZONE 'America/Los_Angeles';
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- "+HH:MM" | "-HHMM" | "Z" → "+HH:MM"; anything else → NULL.
CREATE OR REPLACE FUNCTION pg_temp.cei_offset(raw TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN btrim(raw) IN ('Z', 'z') THEN '+00:00'
    WHEN btrim(raw) ~ '^[+-]\d{2}:?\d{2}$'
     AND substr(btrim(raw), 2, 2)::int <= 14
     AND right(btrim(raw), 2)::int <= 59
      THEN substr(btrim(raw), 1, 3) || ':' || right(btrim(raw), 2)
  END
$$;

-- ISO-ish stamp: zoned → as given; bare wall clock → at `offs`, else LA.
CREATE OR REPLACE FUNCTION pg_temp.cei_iso(raw TEXT, offs TEXT) RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN nullif(btrim(raw), '') IS NULL THEN NULL
    WHEN btrim(raw) ~* '(Z|[+-]\d{2}:?\d{2})$' THEN pg_temp.cei_tstz(btrim(raw))
    WHEN btrim(raw) ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$'
      THEN pg_temp.cei_wall(replace(btrim(raw), 'T', ' '), offs)
  END
$$;

-- UPS: "YYYYMMDD"/"YYYY-MM-DD" → "YYYY-MM-DD"; "HHMMSS"/"HH:MM:SS"/"HHMM" → "HH:MM:SS".
CREATE OR REPLACE FUNCTION pg_temp.cei_date(raw TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN replace(btrim(raw), '-', '') ~ '^\d{8}$' THEN
    substr(replace(btrim(raw), '-', ''), 1, 4) || '-' ||
    substr(replace(btrim(raw), '-', ''), 5, 2) || '-' ||
    substr(replace(btrim(raw), '-', ''), 7, 2)
  END
$$;

CREATE OR REPLACE FUNCTION pg_temp.cei_time(raw TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN replace(btrim(raw), ':', '') ~ '^\d{4}(\d{2})?$' THEN
    substr(replace(btrim(raw), ':', ''), 1, 2) || ':' ||
    substr(replace(btrim(raw), ':', ''), 3, 2) || ':' ||
    coalesce(nullif(substr(replace(btrim(raw), ':', ''), 5, 2), ''), '00')
  END
$$;

-- ─── 1. Recompute every event's instant from its payload ────────────────────
DROP TABLE IF EXISTS pg_temp.cei_recomputed;
CREATE TEMP TABLE cei_recomputed ON COMMIT DROP AS
SELECT e.id,
       e.shipment_id,
       e.carrier,
       e.external_status_code,
       e.external_event_id AS old_event_id,
       e.event_occurred_at AS old_at,
       n.new_at,
       CASE
         WHEN e.carrier = 'USPS' AND e.external_status_code IS NOT NULL AND n.new_at IS NOT NULL
           THEN e.external_status_code || ':' ||
                to_char(n.new_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         ELSE e.external_event_id
       END AS new_event_id
  FROM shipment_tracking_events e
  CROSS JOIN LATERAL (
    SELECT CASE e.carrier
      WHEN 'UPS' THEN
        CASE
          WHEN pg_temp.cei_date(e.payload->>'gmtDate') IS NOT NULL
           AND pg_temp.cei_time(e.payload->>'gmtTime') IS NOT NULL
            THEN pg_temp.cei_wall(pg_temp.cei_date(e.payload->>'gmtDate') || ' ' ||
                                  pg_temp.cei_time(e.payload->>'gmtTime'), '+00:00')
          WHEN pg_temp.cei_date(e.payload->>'date') IS NOT NULL
            THEN pg_temp.cei_wall(pg_temp.cei_date(e.payload->>'date') || ' ' ||
                                  coalesce(pg_temp.cei_time(e.payload->>'time'), '00:00:00'),
                                  pg_temp.cei_offset(e.payload->>'gmtOffset'))
        END
      WHEN 'FEDEX' THEN pg_temp.cei_iso(e.payload->>'date', NULL)
      WHEN 'USPS' THEN
        coalesce(
          pg_temp.cei_iso(coalesce(e.payload->>'GMTTimestamp', e.payload->>'gmtTimestamp'), '+00:00'),
          pg_temp.cei_iso(coalesce(e.payload->>'eventTimestamp', e.payload->>'EventTimestamp'),
                          pg_temp.cei_offset(coalesce(e.payload->>'GMTOffset', e.payload->>'gmtOffset')))
        )
    END AS new_at
  ) n
 WHERE n.new_at IS NOT NULL;

DELETE FROM cei_recomputed
 WHERE new_at = old_at
   AND new_event_id IS NOT DISTINCT FROM old_event_id;

-- ─── 2. Stale twins: the corrected key is already held by an unchanged row ──
DROP TABLE IF EXISTS pg_temp.cei_stale;
CREATE TEMP TABLE cei_stale ON COMMIT DROP AS
SELECT c.id
  FROM cei_recomputed c
 WHERE EXISTS (
   SELECT 1
     FROM shipment_tracking_events o
    WHERE o.shipment_id = c.shipment_id
      AND o.id <> c.id
      AND NOT EXISTS (SELECT 1 FROM cei_recomputed m WHERE m.id = o.id)
      AND COALESCE(o.external_event_id, '')    = COALESCE(c.new_event_id, '')
      AND COALESCE(o.external_status_code, '') = COALESCE(c.external_status_code, '')
      AND COALESCE(o.event_occurred_at, 'epoch'::timestamptz) = c.new_at
 );

INSERT INTO carrier_event_time_backup_2026_09_25 (kind, row_id, snapshot)
SELECT 'event_deleted', e.id, to_jsonb(e)
  FROM shipment_tracking_events e
  JOIN cei_stale s ON s.id = e.id
ON CONFLICT DO NOTHING;

DELETE FROM shipment_tracking_events e USING cei_stale s WHERE e.id = s.id;
DELETE FROM cei_recomputed c USING cei_stale s WHERE c.id = s.id;

-- ─── 3. Retime (and, for USPS, re-identify) the rest ────────────────────────
INSERT INTO carrier_event_time_backup_2026_09_25 (kind, row_id, snapshot)
SELECT 'event', c.id,
       jsonb_build_object('event_occurred_at', c.old_at, 'external_event_id', c.old_event_id,
                          'shipment_id', c.shipment_id, 'carrier', c.carrier)
  FROM cei_recomputed c
ON CONFLICT DO NOTHING;

UPDATE shipment_tracking_events e
   SET event_occurred_at = c.new_at,
       external_event_id = c.new_event_id
  FROM cei_recomputed c
 WHERE e.id = c.id;

-- ─── 4. STN milestones from the corrected log ───────────────────────────────
DROP TABLE IF EXISTS pg_temp.cei_milestones;
CREATE TEMP TABLE cei_milestones ON COMMIT DROP AS
SELECT shipment_id,
       min(event_occurred_at) FILTER (WHERE normalized_status_category = 'LABEL_CREATED')    AS label_created_at,
       min(event_occurred_at) FILTER (WHERE normalized_status_category = 'ACCEPTED')         AS carrier_accepted_at,
       min(event_occurred_at) FILTER (WHERE normalized_status_category = 'IN_TRANSIT')       AS first_in_transit_at,
       max(event_occurred_at) FILTER (WHERE normalized_status_category = 'OUT_FOR_DELIVERY') AS out_for_delivery_at,
       min(event_occurred_at) FILTER (WHERE normalized_status_category = 'DELIVERED')        AS delivered_at,
       max(event_occurred_at) FILTER (WHERE normalized_status_category = 'EXCEPTION')        AS exception_at,
       max(event_occurred_at)                                                                AS latest_event_at
  FROM shipment_tracking_events
 WHERE event_occurred_at IS NOT NULL
 GROUP BY shipment_id;

DROP TABLE IF EXISTS pg_temp.cei_stn_changes;
CREATE TEMP TABLE cei_stn_changes ON COMMIT DROP AS
SELECT s.id
  FROM shipping_tracking_numbers s
  JOIN cei_milestones m ON m.shipment_id = s.id
 WHERE COALESCE(m.label_created_at,    s.label_created_at)    IS DISTINCT FROM s.label_created_at
    OR COALESCE(m.carrier_accepted_at, s.carrier_accepted_at) IS DISTINCT FROM s.carrier_accepted_at
    OR COALESCE(m.first_in_transit_at, s.first_in_transit_at) IS DISTINCT FROM s.first_in_transit_at
    OR COALESCE(m.out_for_delivery_at, s.out_for_delivery_at) IS DISTINCT FROM s.out_for_delivery_at
    OR COALESCE(m.delivered_at,        s.delivered_at)        IS DISTINCT FROM s.delivered_at
    OR COALESCE(m.exception_at,        s.exception_at)        IS DISTINCT FROM s.exception_at
    OR COALESCE(m.latest_event_at,     s.latest_event_at)     IS DISTINCT FROM s.latest_event_at;

INSERT INTO carrier_event_time_backup_2026_09_25 (kind, row_id, snapshot)
SELECT 'shipment', s.id,
       jsonb_build_object(
         'label_created_at',    s.label_created_at,
         'carrier_accepted_at', s.carrier_accepted_at,
         'first_in_transit_at', s.first_in_transit_at,
         'out_for_delivery_at', s.out_for_delivery_at,
         'delivered_at',        s.delivered_at,
         'exception_at',        s.exception_at,
         'latest_event_at',     s.latest_event_at,
         'carrier',             s.carrier)
  FROM shipping_tracking_numbers s
  JOIN cei_stn_changes c ON c.id = s.id
ON CONFLICT DO NOTHING;

UPDATE shipping_tracking_numbers s
   SET label_created_at    = COALESCE(m.label_created_at,    s.label_created_at),
       carrier_accepted_at = COALESCE(m.carrier_accepted_at, s.carrier_accepted_at),
       first_in_transit_at = COALESCE(m.first_in_transit_at, s.first_in_transit_at),
       out_for_delivery_at = COALESCE(m.out_for_delivery_at, s.out_for_delivery_at),
       delivered_at        = COALESCE(m.delivered_at,        s.delivered_at),
       exception_at        = COALESCE(m.exception_at,        s.exception_at),
       latest_event_at     = COALESCE(m.latest_event_at,     s.latest_event_at),
       updated_at          = now()
  FROM cei_milestones m, cei_stn_changes c
 WHERE m.shipment_id = s.id
   AND c.id = s.id;

-- ─── 5. Report ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT carrier, count(*) AS n,
           count(*) FILTER (WHERE old_event_id IS DISTINCT FROM new_event_id) AS reid
      FROM cei_recomputed GROUP BY carrier ORDER BY carrier
  LOOP
    RAISE NOTICE 'carrier-event-instants: % events retimed=% (external_event_id rewritten=%)', r.carrier, r.n, r.reid;
  END LOOP;
  RAISE NOTICE 'carrier-event-instants: stale twins removed=%', (SELECT count(*) FROM cei_stale);
  RAISE NOTICE 'carrier-event-instants: shipments with milestones recomputed=%', (SELECT count(*) FROM cei_stn_changes);
  FOR r IN
    SELECT s.carrier,
           count(*) FILTER (WHERE s.label_created_at    IS NOT NULL AND m.label_created_at    IS NULL) AS label,
           count(*) FILTER (WHERE s.carrier_accepted_at IS NOT NULL AND m.carrier_accepted_at IS NULL) AS accepted,
           count(*) FILTER (WHERE s.first_in_transit_at IS NOT NULL AND m.first_in_transit_at IS NULL) AS in_transit,
           count(*) FILTER (WHERE s.out_for_delivery_at IS NOT NULL AND m.out_for_delivery_at IS NULL) AS ofd,
           count(*) FILTER (WHERE s.delivered_at        IS NOT NULL AND m.delivered_at        IS NULL) AS delivered,
           count(*) FILTER (WHERE s.exception_at        IS NOT NULL AND m.exception_at        IS NULL) AS exception
      FROM shipping_tracking_numbers s
      LEFT JOIN cei_milestones m ON m.shipment_id = s.id
     GROUP BY s.carrier ORDER BY s.carrier
  LOOP
    RAISE NOTICE 'carrier-event-instants: % milestones kept WITHOUT event backing: label=% accepted=% in_transit=% out_for_delivery=% delivered=% exception=%',
      r.carrier, r.label, r.accepted, r.in_transit, r.ofd, r.delivered, r.exception;
  END LOOP;
END $$;
