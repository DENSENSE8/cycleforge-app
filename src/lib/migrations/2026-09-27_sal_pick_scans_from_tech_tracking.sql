-- ============================================================================
-- 2026-09-27_sal_pick_scans_from_tech_tracking.sql
--
-- WHAT
--   station_activity_logs rows station='TECH' + activity_type='TRACKING_SCANNED'
--   become station='PICK' + activity_type='PICK_SCANNED'. Each moved row gets
--   metadata.reclassified_from = 'TECH/TRACKING_SCANNED' (the rollback key).
--
-- WHY
--   That row has exactly one writer: POST /api/tech/scan's tracking branch,
--   reached only from ShippingScanBand → useStationTestingController →
--   handleTrackingScan — the order desk the sidebar names "Picker"
--   (/test?ship=urgent). The QC bench (/test?view=testing) never writes it;
--   bench QC lands in testing_results. Yet the order feed read the row as both
--   QC (test_activity CTE) and Pick (PICK_FACTS_LATERALS pick_station arm).
--   Measured 2026-09-27 (dev): metadata.source 'tech.scan' 3267,
--   'tech.scan.backfill' 506, none 21 — one desk, no per-row discriminator, so
--   the rule is "all of them are pick scans". FBA-source tracking scans are
--   written with station='FBA' and are untouched.
--
-- SAFETY / GATING
--   Apply together with the code that writes PICK/PICK_SCANNED and reads it
--   (src/lib/station-activity.ts PICK_ACTIVITY_TYPES and its readers). Before
--   that code is live the old readers would lose these rows.
--   Idempotent: the WHERE matches only rows still on TECH/TRACKING_SCANNED.
--   station VARCHAR(20) / activity_type VARCHAR(30): both values fit; no CHECK
--   constraint or trigger on this table.
--
-- ROLLBACK
--   UPDATE station_activity_logs
--      SET station = 'TECH', activity_type = 'TRACKING_SCANNED',
--          metadata = metadata - 'reclassified_from'
--    WHERE metadata->>'reclassified_from' = 'TECH/TRACKING_SCANNED';
--
-- VERIFY
--   SELECT station, activity_type, count(*) FROM station_activity_logs
--    WHERE activity_type IN ('TRACKING_SCANNED', 'PICK_SCANNED') GROUP BY 1, 2;
--   -- expect: no TECH/TRACKING_SCANNED; PICK/PICK_SCANNED = the moved count.
-- ============================================================================

UPDATE station_activity_logs
   SET station = 'PICK',
       activity_type = 'PICK_SCANNED',
       metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reclassified_from', 'TECH/TRACKING_SCANNED')
 WHERE station = 'TECH'
   AND activity_type = 'TRACKING_SCANNED';
