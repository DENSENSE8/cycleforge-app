/**
 * Ad-hoc profiler (NOT wired into CI) — EXPLAIN (ANALYZE, BUFFERS) the
 * receiving-lines `view=activity` spine query the /unbox History tab paints
 * from, to find the server-side floor. Connects with a raw `pg` pool (bypassing
 * the `server-only`-guarded src/lib/db) and replicates the tenant GUC.
 *
 * The `--conditions=react-server` flag is REQUIRED: build-sql transitively
 * imports a module guarded by `server-only`, whose Node shim throws unless the
 * react-server export condition selects its no-op twin.
 *
 * Run:  NODE_OPTIONS='--conditions=react-server' npx tsx scripts/explain-activity-list.mts
 *       EXPLAIN_LIMIT=500 NODE_OPTIONS='--conditions=react-server' npx tsx scripts/explain-activity-list.mts
 *
 * 2026-07 finding: the `ORDER BY unboxed_at` key lives on a JOINED table
 * (receiving_unbox), so PG joins the full ~1300-row candidate set through ~15
 * display laterals, sorts, THEN applies LIMIT — ~566K shared-buffer hits to
 * return 150 rows. Fix = pre-limit-then-hydrate (rank cheap columns → LIMIT →
 * join display laterals to only the visible page). That rewrites the shared
 * list SQL waist + fixture, so it is deliberately left as an ask-first step.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import { buildReceivingLinesListSql } from '@/lib/receiving/lines/build-sql';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';

const orgId = process.env.PW_ORG_ID?.trim() || DOGFOOD_ORG_ID;
const limit = process.env.EXPLAIN_LIMIT || '150';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL missing');

const qs = new URLSearchParams(
  `view=activity&search_field=all&search_scope=all&sort=unboxed_newest&limit=${limit}&offset=0`,
);
const query = parseReceivingLinesQuery(qs);
const built = buildReceivingLinesListSql({
  query,
  orgId,
  viewerStaffId: NaN,
  universalIncoming: false,
  applyScannedZohoExclusion: false,
});

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
  await client.query(built.list.sql, built.list.params as unknown[]); // warm
  const explain = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) ${built.list.sql}`,
    built.list.params as unknown[],
  );
  await client.query('COMMIT');
  for (const row of explain.rows) console.log(row['QUERY PLAN']);
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
process.exit(0);
