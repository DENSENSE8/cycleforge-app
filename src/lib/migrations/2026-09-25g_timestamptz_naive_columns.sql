-- ============================================================================
-- 2026-09-25g — naive `timestamp` columns → timestamptz (true instants)
-- ============================================================================
--
-- WHAT
--   1. Converts the last 23 `timestamp without time zone` business columns to
--      `timestamptz`, reading every stored value as America/Los_Angeles wall
--      clock (explicit zone — never the runner's session TimeZone):
--        available_sku_suffixes(created_at, used_at) · customers(created_at) ·
--        ebay_accounts(created_at, updated_at, token_expires_at,
--          refresh_token_expires_at, last_sync_date) · orders(created_at) ·
--        orders_exceptions(created_at, updated_at) · packer_logs(created_at) ·
--        receiving_carton(receiving_date_time) · serial_units(legacy_date_time) ·
--        sku(created_at, date_time, updated_at) ·
--        sku_management(created_at, updated_at) · staff(created_at) ·
--        staff_goal_history(created_at) · staff_goals(updated_at) ·
--        tech_serial_numbers(created_at)
--      Views that read a converted column (lane: `receiving`,
--      `v_unfound_queue`, found via pg_depend, plus any view stacked on them)
--      are captured (definition, reloptions e.g. security_invoker, owner,
--      grants, comments), dropped, and recreated unchanged. Indexes and
--      DEFAULT now()/CURRENT_TIMESTAMP carry over (ALTER strips the implicit
--      ::timestamp coercion, so defaults stay exact instants).
--   2. Repairs rows PROVEN (by an independent timestamptz twin or a fixed
--      arithmetic relation) to hold a UTC wall clock instead of LA wall clock:
--        packer_logs.created_at
--          E1  live writer in a GMT session: the first station_activity_logs
--              twin (packer_log_id, non-backfill, written by its own now())
--              equals created_at read as UTC (±2 min).       lane: 20 rows
--          E2  no SAL twin: packer_logs.updated_at (timestamptz, own now())
--              equals created_at read as UTC (±2 min).       lane: 5 rows
--          E3  packing-logs backfill of 2026-02-27..03-10: millisecond
--              (JS toISOString) stamps; the backfilled SAL equals created_at
--              read as UTC exactly and every such row lands in shop hours only
--              when read as UTC (17–00h UTC wall); the writer switched to LA
--              wall on 2026-03-11 (id 1894 is bracketed by LA rows).
--                                                             lane: 308 rows
--        station_activity_logs.created_at (backfill twins of packer_logs)
--          S1  the backfill copied an LA-wall packer_logs stamp into SAL as if
--              UTC (SAL = created_at read as UTC, exactly); those packer_logs
--              rows are LA wall (hours 9–16) → SAL is re-stamped to the
--              packer_logs instant.                           lane: 770 rows
--        orders.created_at          O1  = first entity_search_outbox enqueue
--                                       (insert trigger, same now()) read as
--                                       UTC, exactly.         lane: 2 rows
--        receiving_carton.receiving_date_time
--                                   R1  = receiving_carton.created_at (same
--                                       statement now()) read as UTC, exactly.
--                                                             lane: 26 rows
--        customers.created_at       C1  = customers.updated_at (same statement
--                                       now()) read as UTC, exactly.
--                                                             lane: 38 rows
--        ebay_accounts.token_expires_at
--                                   K1  = the vault twin
--                                       organization_integrations.expires_at
--                                       (provider ebay, scope role:account)
--                                       read as UTC, exactly. lane: 2 rows
--        ebay_accounts.refresh_token_expires_at
--                                   K2  read as UTC it is exactly eBay's fixed
--                                       47,304,000 s refresh lifetime after
--                                       created_at (±60 s).   lane: 2 rows
--      Every other column has no twin, or its twin proves LA wall
--      (tech_serial_numbers, orders_exceptions, serial_units.legacy_date_time,
--      staff_goal_history) → converted as LA wall, not repaired.
--
-- WHY
--   The app pool (src/lib/db.ts) runs with TimeZone=America/Los_Angeles, so
--   now()/CURRENT_TIMESTAMP stored LA wall clock. Other writers stored UTC wall
--   clock into the same columns: src/lib/neon-client.ts and drizzle neon-http
--   sessions are GMT (now() → UTC wall); JS Date params are serialized in the
--   Node process zone, which is UTC on Vercel; drizzle/clients sending
--   toISOString() strings drop the Z into a naive column; psql/scripts are GMT.
--   The mix made packer_logs 6210 read 7h early and every JS read of these
--   columns depend on the process zone.
--
-- SAFETY
--   * Every value is converted with an explicit zone; the result does not
--     depend on the runner's session TimeZone.
--   * Repairs are decided BEFORE the conversion (on the naive values) and
--     recorded in tz_repair_backup_2026_09_25 (ON CONFLICT DO NOTHING — the
--     first run's originals are kept). They are applied only while the row
--     still holds the LA reading of that original (SAL: the original instant),
--     so a rerun changes 0 rows.
--   * Evidence capture and conversion run only for columns still typed
--     `timestamp`; views are dropped/recreated only when such a column exists.
--     A second run is a no-op.
--   * Views are dropped without CASCADE: an unexpected dependent (function,
--     materialized view) aborts the transaction instead of vanishing.
--   * No triggers fire on the repaired columns (no UPDATE OF these columns);
--     the runner connects as neondb_owner (BYPASSRLS), so FORCE RLS hides no
--     rows.
--   * ALTER TYPE rewrites orders/packer_logs/receiving_carton/… under ACCESS
--     EXCLUSIVE locks — seconds at current sizes (≤ ~6k rows per table).
--   * tz_repair_backup_2026_09_25 is a deliberately UNSCOPED ops-restore table
--     (no organization_id / RLS): never read by the app; drop it once the
--     rollback window closes.
--
-- ROLLBACK
--   BEGIN;
--   -- undo repairs (SAL: old_value is the original instant's UTC wall clock)
--   UPDATE station_activity_logs s SET created_at = b.old_value AT TIME ZONE 'UTC'
--     FROM tz_repair_backup_2026_09_25 b
--    WHERE b.table_name = 'station_activity_logs' AND s.id = b.row_pk::int;
--   -- other repaired columns: <col> = b.old_value AT TIME ZONE 'America/Los_Angeles'
--   --   per (table_name, column_name), e.g.
--   UPDATE packer_logs t SET created_at = b.old_value AT TIME ZONE 'America/Los_Angeles'
--     FROM tz_repair_backup_2026_09_25 b
--    WHERE b.table_name = 'packer_logs' AND b.column_name = 'created_at'
--      AND t.id = b.row_pk::int;
--   -- back to naive (drop/recreate `receiving` + `v_unfound_queue` around it):
--   --   ALTER TABLE <t> ALTER COLUMN <c> TYPE timestamp
--   --     USING <c> AT TIME ZONE 'America/Los_Angeles';
--   COMMIT;
--   (Reverting the type also needs the code of this change reverted: readers
--   now treat these columns as instants.)
--
-- VERIFY
--   SELECT created_at FROM packer_logs WHERE id = 6210;   -- 2026-08-24 23:10:09+00
--   SELECT table_name, column_name, count(*) FROM tz_repair_backup_2026_09_25 GROUP BY 1, 2;
--   SELECT round(extract(epoch FROM pl.created_at - s.created_at) / 3600) h, count(*)
--     FROM packer_logs pl JOIN station_activity_logs s ON s.packer_log_id = pl.id
--    GROUP BY 1 ORDER BY 2 DESC;                          -- ~all rows at 0h
--   SELECT 1 FROM receiving LIMIT 1; SELECT 1 FROM v_unfound_queue LIMIT 1;
-- ============================================================================

CREATE TABLE IF NOT EXISTS tz_repair_backup_2026_09_25 (
  table_name  TEXT        NOT NULL,
  row_pk      TEXT        NOT NULL,
  column_name TEXT        NOT NULL,
  old_value   TIMESTAMP,
  repaired_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (table_name, row_pk, column_name)
);

COMMENT ON TABLE tz_repair_backup_2026_09_25 IS
  'Ops-restore snapshot for 2026-09-25g: original naive value of every row the migration re-stamped as UTC wall clock (station_activity_logs rows: the original instant as UTC wall clock). Unscoped by design; drop after the rollback window.';

-- ----------------------------------------------------------------------------
-- 1. Evidence capture (naive values; skipped once a column is timestamptz)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.tz_is_naive(p_table TEXT, p_column TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
       AND data_type = 'timestamp without time zone')
$$;

DO $capture$
BEGIN
  IF pg_temp.tz_is_naive('packer_logs', 'created_at') THEN
    -- E1 + E3: first SAL twin
    INSERT INTO tz_repair_backup_2026_09_25 (table_name, row_pk, column_name, old_value)
    SELECT 'packer_logs', pl.id::text, 'created_at', pl.created_at
      FROM packer_logs pl
      JOIN LATERAL (
        SELECT s.created_at, COALESCE(s.metadata->>'source', '') AS src
          FROM station_activity_logs s
         WHERE s.packer_log_id = pl.id
         ORDER BY s.id
         LIMIT 1) tw ON true
     WHERE pl.created_at IS NOT NULL
       AND (
         -- E1: live writer in a GMT session
         (tw.src NOT ILIKE '%backfill%'
          AND abs(extract(epoch FROM pl.created_at - (tw.created_at AT TIME ZONE 'UTC'))) < 120)
         OR
         -- E3: 2026-02-27..03-10 millisecond backfill stamps
         (tw.src = 'packing-logs.backfill'
          AND pl.created_at <> date_trunc('second', pl.created_at)
          AND pl.created_at = date_trunc('milliseconds', pl.created_at)
          AND pl.created_at < TIMESTAMP '2026-03-11 00:00:00'
          AND tw.created_at = (pl.created_at AT TIME ZONE 'UTC'))
       )
    ON CONFLICT DO NOTHING;

    -- E2: no SAL twin; own updated_at (timestamptz now()) agrees only as UTC
    INSERT INTO tz_repair_backup_2026_09_25 (table_name, row_pk, column_name, old_value)
    SELECT 'packer_logs', pl.id::text, 'created_at', pl.created_at
      FROM packer_logs pl
     WHERE pl.created_at IS NOT NULL AND pl.updated_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM station_activity_logs s WHERE s.packer_log_id = pl.id)
       AND abs(extract(epoch FROM pl.created_at - (pl.updated_at AT TIME ZONE 'UTC'))) < 120
       AND abs(extract(epoch FROM pl.created_at - (pl.updated_at AT TIME ZONE 'America/Los_Angeles'))) >= 120
    ON CONFLICT DO NOTHING;

    -- S1: backfilled SAL rows that copied an LA-wall packer_logs stamp as UTC
    INSERT INTO tz_repair_backup_2026_09_25 (table_name, row_pk, column_name, old_value)
    SELECT 'station_activity_logs', s.id::text, 'created_at', s.created_at AT TIME ZONE 'UTC'
      FROM station_activity_logs s
      JOIN packer_logs pl ON pl.id = s.packer_log_id
     WHERE COALESCE(s.metadata->>'source', '') ILIKE '%backfill%'
       AND s.created_at = (pl.created_at AT TIME ZONE 'UTC')
       AND NOT EXISTS (
         SELECT 1 FROM tz_repair_backup_2026_09_25 b
          WHERE b.table_name = 'packer_logs' AND b.column_name = 'created_at'
            AND b.row_pk = pl.id::text)
    ON CONFLICT DO NOTHING;
  END IF;

  IF pg_temp.tz_is_naive('orders', 'created_at') THEN
    -- O1: insert-trigger outbox enqueue shares the INSERT's now()
    INSERT INTO tz_repair_backup_2026_09_25 (table_name, row_pk, column_name, old_value)
    SELECT 'orders', o.id::text, 'created_at', o.created_at
      FROM orders o
      JOIN (SELECT entity_id, min(enqueued_at) AS enqueued_at
              FROM entity_search_outbox
             WHERE entity_type = 'ORDER'
             GROUP BY entity_id) e ON e.entity_id = o.id
     WHERE o.created_at = (e.enqueued_at AT TIME ZONE 'UTC')
    ON CONFLICT DO NOTHING;
  END IF;

  IF pg_temp.tz_is_naive('receiving_carton', 'receiving_date_time') THEN
    -- R1
    INSERT INTO tz_repair_backup_2026_09_25 (table_name, row_pk, column_name, old_value)
    SELECT 'receiving_carton', r.id::text, 'receiving_date_time', r.receiving_date_time
      FROM receiving_carton r
     WHERE r.receiving_date_time = (r.created_at AT TIME ZONE 'UTC')
    ON CONFLICT DO NOTHING;
  END IF;

  IF pg_temp.tz_is_naive('customers', 'created_at') THEN
    -- C1
    INSERT INTO tz_repair_backup_2026_09_25 (table_name, row_pk, column_name, old_value)
    SELECT 'customers', c.id::text, 'created_at', c.created_at
      FROM customers c
     WHERE c.created_at = (c.updated_at AT TIME ZONE 'UTC')
    ON CONFLICT DO NOTHING;
  END IF;

  IF pg_temp.tz_is_naive('ebay_accounts', 'token_expires_at') THEN
    -- K1: vault twin
    INSERT INTO tz_repair_backup_2026_09_25 (table_name, row_pk, column_name, old_value)
    SELECT 'ebay_accounts', ea.id::text, 'token_expires_at', ea.token_expires_at
      FROM ebay_accounts ea
      JOIN organization_integrations oi
        ON oi.organization_id = ea.organization_id
       AND oi.provider = 'ebay'
       AND oi.scope = ea.account_role || ':' || ea.account_name
     WHERE ea.token_expires_at = (oi.expires_at AT TIME ZONE 'UTC')
    ON CONFLICT DO NOTHING;
  END IF;

  IF pg_temp.tz_is_naive('ebay_accounts', 'refresh_token_expires_at')
     AND pg_temp.tz_is_naive('ebay_accounts', 'created_at') THEN
    -- K2: eBay refresh tokens live exactly 47,304,000 s
    INSERT INTO tz_repair_backup_2026_09_25 (table_name, row_pk, column_name, old_value)
    SELECT 'ebay_accounts', ea.id::text, 'refresh_token_expires_at', ea.refresh_token_expires_at
      FROM ebay_accounts ea
     WHERE COALESCE(ea.platform, 'EBAY') = 'EBAY'
       AND abs(extract(epoch FROM
             (ea.refresh_token_expires_at AT TIME ZONE 'UTC')
             - (ea.created_at AT TIME ZONE 'America/Los_Angeles')
             - INTERVAL '47304000 seconds')) < 60
    ON CONFLICT DO NOTHING;
  END IF;
END
$capture$;

-- ----------------------------------------------------------------------------
-- 2. Conversion (views captured → dropped → columns altered → views recreated)
-- ----------------------------------------------------------------------------
DO $convert$
DECLARE
  targets CONSTANT TEXT[][] := ARRAY[
    ['available_sku_suffixes', 'created_at'],
    ['available_sku_suffixes', 'used_at'],
    ['customers', 'created_at'],
    ['ebay_accounts', 'created_at'],
    ['ebay_accounts', 'updated_at'],
    ['ebay_accounts', 'token_expires_at'],
    ['ebay_accounts', 'refresh_token_expires_at'],
    ['ebay_accounts', 'last_sync_date'],
    ['orders', 'created_at'],
    ['orders_exceptions', 'created_at'],
    ['orders_exceptions', 'updated_at'],
    ['packer_logs', 'created_at'],
    ['receiving_carton', 'receiving_date_time'],
    ['serial_units', 'legacy_date_time'],
    ['sku', 'created_at'],
    ['sku', 'date_time'],
    ['sku', 'updated_at'],
    ['sku_management', 'created_at'],
    ['sku_management', 'updated_at'],
    ['staff', 'created_at'],
    ['staff_goal_history', 'created_at'],
    ['staff_goals', 'updated_at'],
    ['tech_serial_numbers', 'created_at']
  ];
  i INT;
  v RECORD;
  g RECORD;
  alters TEXT;
  v_tbl TEXT;
BEGIN
  DROP TABLE IF EXISTS pg_temp.tz_todo, pg_temp.tz_views;
  CREATE TEMP TABLE tz_todo (tbl TEXT, col TEXT, attrelid OID, attnum SMALLINT) ON COMMIT DROP;
  FOR i IN 1 .. array_length(targets, 1) LOOP
    INSERT INTO tz_todo
    SELECT targets[i][1], targets[i][2], a.attrelid, a.attnum
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass(format('public.%I', targets[i][1]))
       AND a.attname = targets[i][2]
       AND NOT a.attisdropped
       AND a.atttypid = 'timestamp'::regtype;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM tz_todo) THEN
    RAISE NOTICE '2026-09-25g: all columns already timestamptz — nothing to convert';
    RETURN;
  END IF;

  -- Views reading a converted column, plus every view stacked on those.
  CREATE TEMP TABLE tz_views ON COMMIT DROP AS
  WITH RECURSIVE dep(oid, depth) AS (
    SELECT DISTINCT r.ev_class, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid
      JOIN tz_todo t ON t.attrelid = d.refobjid AND t.attnum = d.refobjsubid
     WHERE d.classid = 'pg_rewrite'::regclass
       AND d.refclassid = 'pg_class'::regclass
       AND r.ev_class <> d.refobjid
    UNION
    SELECT r.ev_class, dep.depth + 1
      FROM dep
      JOIN pg_depend d ON d.refobjid = dep.oid AND d.refclassid = 'pg_class'::regclass
                      AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_rewrite r ON r.oid = d.objid
     WHERE r.ev_class <> dep.oid
  )
  SELECT c.oid,
         dd.depth                               AS depth,
         c.relname::text                        AS name,
         format('%I.%I', n.nspname, c.relname)  AS qn,
         c.relkind                              AS relkind,
         pg_get_userbyid(c.relowner)::text      AS owner,
         c.reloptions                           AS reloptions,
         rtrim(btrim(pg_get_viewdef(c.oid)), ';') AS def,
         obj_description(c.oid, 'pg_class')     AS comment,
         (SELECT array_agg(ARRAY[a.attname::text, pd.description])
            FROM pg_description pd
            JOIN pg_attribute a ON a.attrelid = pd.objoid AND a.attnum = pd.objsubid
           WHERE pd.objoid = c.oid AND pd.classoid = 'pg_class'::regclass
             AND pd.objsubid > 0)               AS col_comments,
         (SELECT array_agg(ARRAY[
                   CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END,
                   x.privilege_type,
                   x.is_grantable::text])
            FROM aclexplode(c.relacl) x
           WHERE x.grantee <> c.relowner)       AS grants
    FROM (SELECT dep.oid, max(dep.depth) AS depth FROM dep GROUP BY dep.oid) dd
    JOIN pg_class c ON c.oid = dd.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace;

  IF EXISTS (SELECT 1 FROM tz_views WHERE relkind <> 'v') THEN
    RAISE EXCEPTION '2026-09-25g: non-view dependents found: %',
      (SELECT string_agg(name || ':' || relkind, ', ') FROM tz_views WHERE relkind <> 'v');
  END IF;

  FOR v IN SELECT * FROM tz_views ORDER BY depth DESC, name LOOP
    EXECUTE format('DROP VIEW %s', v.qn);
  END LOOP;

  FOR v_tbl IN SELECT DISTINCT t.tbl FROM tz_todo t ORDER BY 1 LOOP
    SELECT string_agg(
             format('ALTER COLUMN %1$I TYPE timestamptz USING %1$I AT TIME ZONE %2$L',
                    t.col, 'America/Los_Angeles'),
             ', ' ORDER BY t.col)
      INTO alters
      FROM tz_todo t WHERE t.tbl = v_tbl;
    EXECUTE format('ALTER TABLE public.%I %s', v_tbl, alters);
  END LOOP;

  FOR v IN SELECT * FROM tz_views ORDER BY depth, name LOOP
    EXECUTE format('CREATE VIEW %s%s AS %s',
                   v.qn,
                   CASE WHEN v.reloptions IS NULL THEN ''
                        ELSE ' WITH (' || array_to_string(v.reloptions, ', ') || ')' END,
                   v.def);
    IF v.owner <> current_user THEN
      EXECUTE format('ALTER VIEW %s OWNER TO %I', v.qn, v.owner);
    END IF;
    -- Exact ACL: drop whatever default privileges granted, then restore.
    FOR g IN
      SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                           ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS who
        FROM pg_class c, aclexplode(c.relacl) x
       WHERE c.oid = v.qn::regclass
         AND x.grantee <> c.relowner
    LOOP
      EXECUTE format('REVOKE ALL ON %s FROM %s', v.qn, g.who);
    END LOOP;
    IF v.grants IS NOT NULL THEN
      FOR i IN 1 .. array_length(v.grants, 1) LOOP
        EXECUTE format('GRANT %s ON %s TO %s%s',
                       v.grants[i][2], v.qn, v.grants[i][1],
                       CASE WHEN v.grants[i][3] = 'true' THEN ' WITH GRANT OPTION' ELSE '' END);
      END LOOP;
    END IF;
    IF v.comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON VIEW %s IS %L', v.qn, v.comment);
    END IF;
    IF v.col_comments IS NOT NULL THEN
      FOR i IN 1 .. array_length(v.col_comments, 1) LOOP
        EXECUTE format('COMMENT ON COLUMN %s.%I IS %L',
                       v.qn, v.col_comments[i][1], v.col_comments[i][2]);
      END LOOP;
    END IF;
  END LOOP;

  RAISE NOTICE '2026-09-25g: converted % column(s); recreated view(s): %',
    (SELECT count(*) FROM tz_todo),
    COALESCE((SELECT string_agg(name, ', ' ORDER BY depth, name) FROM tz_views), 'none');
END
$convert$;

-- ----------------------------------------------------------------------------
-- 3. Repairs (only rows still holding the LA reading of the captured original)
-- ----------------------------------------------------------------------------
DO $repair$
DECLARE
  pair RECORD;
  n BIGINT;
BEGIN
  FOR pair IN
    SELECT DISTINCT b.table_name, b.column_name
      FROM tz_repair_backup_2026_09_25 b
     WHERE b.table_name <> 'station_activity_logs'
     ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'UPDATE public.%1$I t
          SET %2$I = b.old_value AT TIME ZONE ''UTC''
         FROM tz_repair_backup_2026_09_25 b
        WHERE b.table_name = %3$L AND b.column_name = %4$L
          AND t.id = b.row_pk::bigint
          AND t.%2$I = (b.old_value AT TIME ZONE ''America/Los_Angeles'')',
      pair.table_name, pair.column_name, pair.table_name, pair.column_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '2026-09-25g: repaired %.% (UTC wall → instant): % row(s)',
      pair.table_name, pair.column_name, n;
  END LOOP;

  -- S1: backfilled SAL twins take the (LA-wall, now converted) packer_logs instant.
  UPDATE station_activity_logs s
     SET created_at = pl.created_at
    FROM tz_repair_backup_2026_09_25 b, packer_logs pl
   WHERE b.table_name = 'station_activity_logs' AND b.column_name = 'created_at'
     AND s.id = b.row_pk::int
     AND pl.id = s.packer_log_id
     AND s.created_at = (b.old_value AT TIME ZONE 'UTC')
     AND pl.created_at <> s.created_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '2026-09-25g: re-stamped station_activity_logs.created_at (backfill twins): % row(s)', n;
END
$repair$;
