-- 2026-09-28_tracking_grams8.sql
--
-- WHAT
--   tracking_grams8(t text) RETURNS SETOF text — every 8-character window of
--   t (none when t is shorter than 8 or NULL).
--
-- WHY
--   "Has this shipment been dock-scanned?" (SHIPMENT_SCANNED_PREDICATE,
--   src/lib/receiving/delivered-unscanned.ts) has a fuzzy arm: the shipment's
--   last 8 normalized tracking chars appear anywhere inside a scan's
--   normalized barcode. As a correlated `position(... IN regexp_replace(...))`
--   it re-read and re-normalized every receiving_scans row for every candidate
--   row: 186 Incoming rows x 3,351 scans = 623k regexp evaluations, ~930 ms of
--   the 951 ms Incoming count and ~1.3 s of the 1.5 s Incoming list (EXPLAIN
--   ANALYZE as app_tenant, 2026-09-28). No index can serve it under RLS:
--   LIKE / strpos / @> are not leakproof, so app_tenant never gets a trgm or
--   GIN index scan.
--
--   `x` is a substring of `s` exactly when `x` equals one of `s`'s
--   length(x)-windows, so the predicate becomes
--     right(stn.tracking_number_normalized, 8) IN (SELECT tracking_grams8(...) FROM receiving_scans rs)
--   — uncorrelated, which Postgres builds ONCE per statement as a hashed
--   SubPlan (~60k windows) and probes per row. STRICT stops the planner
--   inlining the body (inlining would fall back to generate_series' default
--   1,000-row estimate, make the set look too big to hash, and pick a per-row
--   rescan); ROWS 16 is the real average window count per scan. plpgsql
--   because it measured ~30% cheaper per call than the SQL-function form.
--
-- SAFETY
--   Creates one IMMUTABLE function; no table, row or lock touched. Not
--   tenant-scoped by design: a pure text function (RLS still filters the
--   receiving_scans rows it is applied to). EXECUTE is granted to PUBLIC by
--   default, so app_tenant can call it.
--
-- VERIFY
--   SELECT array_agg(g) FROM tracking_grams8('1Z999AA10123456784') g;
--   -- 11 windows, first '1Z999AA1', last '23456784'
--   SELECT count(*) FROM tracking_grams8('SHORT');   -- 0
--
-- ROLLBACK
--   Revert the SHIPMENT_SCANNED_PREDICATE change first, then
--   DROP FUNCTION IF EXISTS tracking_grams8(text);

CREATE OR REPLACE FUNCTION tracking_grams8(t text)
RETURNS SETOF text
LANGUAGE plpgsql
IMMUTABLE STRICT PARALLEL SAFE
ROWS 16
AS $$
BEGIN
  FOR i IN 1 .. length(t) - 7 LOOP
    RETURN NEXT substr(t, i, 8);
  END LOOP;
END
$$;
