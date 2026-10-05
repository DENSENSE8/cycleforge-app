/**
 * throughput — read-only cycle-time report across the refurb flow
 * (Garisek-OS docs/loops/AUTORESEARCH.md §5; this repo: docs/loops/THROUGHPUT.md).
 *
 *   pnpm throughput [--days 7] [--org usav]
 *
 * Per step: n, median and p90 minutes for subjects (carton / unit / shipment)
 * whose END event lands in the window, plus daily counts. A step without a
 * trustworthy start/end event pair is `no_data` with the reason — never a
 * guessed number. Writes `.garisek/spec/throughput/<day>.json` and prints a
 * compact table.
 *
 * Safety: the DSN comes from the worktree `.env` only (overriding the shell);
 * every data statement runs through the tenant helper (org GUC, RLS role when
 * configured) inside a transaction switched to READ ONLY, so a write cannot
 * land. The slug lookup runs on the owner pool inside BEGIN READ ONLY … ROLLBACK.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  formatReport,
  measuredStep,
  pairEvents,
  sha256,
  unmeasurableStep,
  type DailyCounts,
  type StepEvent,
  type StepMeta,
  type StepResult,
} from './cycle-times';

const ROOT = process.cwd();
const TZ = 'America/Los_Angeles';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

/*
 * Event sources. Each selects (key, at) for $1 = org. Keys are the subject the
 * step is measured on: carton = receiving_carton.id, unit = serial_units.id
 * (receiving line when the verdict has no unit), shipment = shipment_id.
 */
const CARTON_EVENT = (eventType: string) =>
  `SELECT entity_id::text AS key, occurred_at AS at
     FROM ops_events
    WHERE organization_id = $1 AND entity_type = 'receiving' AND event_type = '${eventType}'`;
const SAL_EVENT = (activityType: string, extra = '') =>
  `SELECT shipment_id::text AS key, created_at AS at
     FROM station_activity_logs
    WHERE organization_id = $1 AND activity_type = '${activityType}' AND shipment_id IS NOT NULL${extra}`;
const UNIT_KEY = `COALESCE(tr.serial_unit_id::text, 'line:' || tr.receiving_line_id)`;

const SRC = {
  cartonArrived: CARTON_EVENT('receiving.carton.arrived'),
  unboxOpened: CARTON_EVENT('UNBOX_SCAN_OPENED'),
  unboxConfirmed: CARTON_EVENT('UNBOX_CONFIRMED'),
  /* The carton unbox confirmation, re-keyed to every unit later tested from that carton. */
  unitCartonUnboxed: `SELECT ${UNIT_KEY} AS key, oe.occurred_at AS at
     FROM testing_results tr
     JOIN receiving_line rl ON rl.organization_id = $1 AND rl.id = tr.receiving_line_id
     JOIN ops_events oe ON oe.organization_id = $1 AND oe.entity_type = 'receiving'
                       AND oe.entity_id = rl.receiving_id AND oe.event_type = 'UNBOX_CONFIRMED'
    WHERE tr.organization_id = $1`,
  unitTested: `SELECT ${UNIT_KEY} AS key, tr.created_at AS at
     FROM testing_results tr
    WHERE tr.organization_id = $1`,
  orderCreated: `SELECT shipment_id::text AS key, created_at AS at
     FROM orders
    WHERE organization_id = $1 AND shipment_id IS NOT NULL`,
  pickScanned: SAL_EVENT('PICK_SCANNED'),
  serialBound: SAL_EVENT('SERIAL_ADDED'),
  packCompleted: SAL_EVENT('PACK_COMPLETED'),
  /*
   * Only live scans: 'shipped-scan-out' is the dock / desk / phone writer
   * (src/lib/outbound/scan-out.ts). Bulk backlog clears, catch-ups, ops
   * backfills and held-scan replays stamp a script or replay time, not the
   * moment the carton left, so they cannot end a cycle time.
   */
  shipScannedOut: SAL_EVENT('SHIP_CONFIRM', ` AND metadata->>'source' = 'shipped-scan-out'`),
} as const;

/** Keys whose end lands in the window ($2, $3), with every start and end event they have. */
function pairSql(start: string, end: string): string {
  return `WITH s AS (${start}),
     e AS (${end}),
     k AS (SELECT DISTINCT key FROM e WHERE at >= $2 AND at < $3)
SELECT key, 'start' AS role, at FROM s WHERE key IN (SELECT key FROM k)
UNION ALL
SELECT key, 'end' AS role, at FROM e WHERE key IN (SELECT key FROM k)`;
}

type StepDef = StepMeta & ({ sql: string } | { noData: string });

const STEPS: readonly StepDef[] = [
  {
    id: 'arrival_to_unbox_open',
    from: 'ops_events:receiving.carton.arrived',
    to: 'ops_events:UNBOX_SCAN_OPENED',
    sql: pairSql(SRC.cartonArrived, SRC.unboxOpened),
  },
  {
    id: 'unbox',
    from: 'ops_events:UNBOX_SCAN_OPENED',
    to: 'ops_events:UNBOX_CONFIRMED',
    sql: pairSql(SRC.unboxOpened, SRC.unboxConfirmed),
  },
  {
    id: 'unbox_to_test',
    from: 'ops_events:UNBOX_CONFIRMED (unit carton)',
    to: 'testing_results (first verdict)',
    sql: pairSql(SRC.unitCartonUnboxed, SRC.unitTested),
  },
  {
    id: 'test_to_stock',
    from: 'testing_results (first verdict)',
    to: 'stock put-away',
    noData:
      'no put-away event log: receiving_line_putaway is a last-write projection (put_away_at overwritten by upsertReceivingLinePutaway) and inventory_events MOVED rows carry no serial_unit_id (0 of 26 in the 30 days checked 2026-10-05)',
  },
  {
    id: 'stock_to_pick',
    from: 'stock put-away',
    to: 'station_activity_logs:PICK_SCANNED',
    noData: 'no per-unit stock-entry event to start from (see test_to_stock), and PICK_SCANNED is keyed by shipment, not by the stocked unit',
  },
  {
    id: 'order_to_pick',
    from: 'orders.created_at',
    to: 'station_activity_logs:PICK_SCANNED',
    sql: pairSql(SRC.orderCreated, SRC.pickScanned),
  },
  {
    id: 'pick_to_serial',
    from: 'station_activity_logs:PICK_SCANNED',
    to: 'station_activity_logs:SERIAL_ADDED',
    sql: pairSql(SRC.pickScanned, SRC.serialBound),
  },
  {
    id: 'pick_to_pack',
    from: 'station_activity_logs:PICK_SCANNED',
    to: 'station_activity_logs:PACK_COMPLETED',
    sql: pairSql(SRC.pickScanned, SRC.packCompleted),
  },
  {
    id: 'pack_to_ship',
    from: 'station_activity_logs:PACK_COMPLETED',
    to: 'station_activity_logs:SHIP_CONFIRM (live scan)',
    sql: pairSql(SRC.packCompleted, SRC.shipScannedOut),
  },
  {
    id: 'order_to_ship',
    from: 'orders.created_at',
    to: 'station_activity_logs:SHIP_CONFIRM (live scan)',
    sql: pairSql(SRC.orderCreated, SRC.shipScannedOut),
  },
];

/** Window days in Pacific time; each count is a subject's FIRST event of that kind landing on the day. */
const DAILY_SQL = `WITH days AS (
  SELECT d::date AS day
    FROM generate_series(($2::timestamptz AT TIME ZONE '${TZ}')::date,
                         (($3::timestamptz - interval '1 millisecond') AT TIME ZONE '${TZ}')::date,
                         interval '1 day') AS d
),
unboxed AS (
  SELECT u.at, COALESCE(SUM(rl.quantity_received), 0) AS units
    FROM (SELECT entity_id, MIN(occurred_at) AS at
            FROM ops_events
           WHERE organization_id = $1 AND entity_type = 'receiving' AND event_type = 'UNBOX_CONFIRMED'
           GROUP BY entity_id) u
    LEFT JOIN receiving_line rl ON rl.organization_id = $1 AND rl.receiving_id = u.entity_id
   WHERE u.at >= $2 AND u.at < $3
   GROUP BY u.entity_id, u.at
),
tested AS (
  SELECT MIN(tr.created_at) AS at FROM testing_results tr WHERE tr.organization_id = $1 GROUP BY ${UNIT_KEY}
),
packed AS (SELECT MIN(at) AS at FROM (${SRC.packCompleted}) x GROUP BY key),
shipped AS (SELECT MIN(at) AS at FROM (${SRC.shipScannedOut}) x GROUP BY key)
SELECT days.day::text AS day,
       (SELECT COUNT(*) FROM unboxed x WHERE (x.at AT TIME ZONE '${TZ}')::date = days.day)::int AS cartons_unboxed,
       (SELECT COALESCE(SUM(x.units), 0) FROM unboxed x WHERE (x.at AT TIME ZONE '${TZ}')::date = days.day)::int AS units_unboxed,
       (SELECT COUNT(*) FROM tested x WHERE x.at >= $2 AND x.at < $3 AND (x.at AT TIME ZONE '${TZ}')::date = days.day)::int AS units_tested,
       (SELECT COUNT(*) FROM packed x WHERE x.at >= $2 AND x.at < $3 AND (x.at AT TIME ZONE '${TZ}')::date = days.day)::int AS shipments_packed,
       (SELECT COUNT(*) FROM shipped x WHERE x.at >= $2 AND x.at < $3 AND (x.at AT TIME ZONE '${TZ}')::date = days.day)::int AS shipments_shipped
  FROM days
 ORDER BY days.day`;

const ORG_SQL = 'SELECT id::text AS id, slug FROM organizations WHERE slug = $1 OR id::text = $1 LIMIT 1';

async function main(): Promise<void> {
  // DSN from the worktree .env only — load it over the shell BEFORE any db module builds its pools.
  const env = loadEnv({ path: join(ROOT, '.env'), override: true, quiet: true });
  if (env.error || !process.env.DATABASE_URL) throw new Error(`throughput: DATABASE_URL not found in ${join(ROOT, '.env')}`);
  process.env.DOTENV_CONFIG_QUIET = 'true'; // db.ts re-runs dotenv.config(); keep its banner off the table

  const days = Number(arg('days', '7'));
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error(`throughput: --days must be an integer 1..365, got ${arg('days', '7')}`);
  const orgArg = arg('org', 'usav');

  // Dynamic on purpose: `@/lib/db` builds its pools from process.env at module load, and a
  // static import would hoist above the .env load (same reason as scripts/bench-identify.ts).
  const { default: pool, tenantPool } = await import('@/lib/db');
  const { withTenantConnection } = await import('@/lib/tenancy/db');

  try {
    const lookup = await pool.connect();
    let org: { id: string; slug: string } | undefined;
    try {
      await lookup.query('BEGIN READ ONLY');
      org = (await lookup.query<{ id: string; slug: string }>(ORG_SQL, [orgArg])).rows[0];
    } finally {
      await lookup.query('ROLLBACK').catch(() => {});
      lookup.release();
    }
    if (!org || !UUID_RE.test(org.id)) throw new Error(`throughput: no organization with slug or id ${orgArg}`);

    const at = new Date();
    const window = { from: new Date(at.getTime() - days * 86_400_000), to: at };
    const params = [org.id, window.from.toISOString(), window.to.toISOString()];

    const { steps, daily } = await withTenantConnection(org.id, async (client) => {
      // Allowed mid-transaction (only read-write → read-only is legal after a query); a write now errors.
      await client.query('SET TRANSACTION READ ONLY');
      const results: StepResult[] = [];
      for (const step of STEPS) {
        if ('noData' in step) {
          results.push(unmeasurableStep(step, step.noData));
          continue;
        }
        const rows = (await client.query<{ key: string; role: 'start' | 'end'; at: Date }>(step.sql, params)).rows;
        const events: StepEvent[] = rows.map((r) => ({ key: r.key, role: r.role, at: new Date(r.at) }));
        results.push(measuredStep({ id: step.id, from: step.from, to: step.to }, pairEvents(events, window)));
      }
      const dailyRows = (await client.query<{
        day: string;
        cartons_unboxed: number;
        units_unboxed: number;
        units_tested: number;
        shipments_packed: number;
        shipments_shipped: number;
      }>(DAILY_SQL, params)).rows;
      const dailyCounts: DailyCounts[] = dailyRows.map((r) => ({
        day: r.day,
        cartonsUnboxed: r.cartons_unboxed,
        unitsUnboxed: r.units_unboxed,
        unitsTested: r.units_tested,
        shipmentsPacked: r.shipments_packed,
        shipmentsShipped: r.shipments_shipped,
      }));
      return { steps: results, daily: dailyCounts };
    });

    const queries: Record<string, string> = { org: sha256(ORG_SQL) };
    for (const step of STEPS) if ('sql' in step) queries[step.id] = sha256(step.sql);
    queries.daily = sha256(DAILY_SQL);

    const receipt = {
      v: 1 as const,
      at: at.toISOString(),
      window: { days, from: window.from.toISOString(), to: window.to.toISOString(), tz: TZ },
      org: { id: org.id, slug: org.slug },
      steps,
      daily,
      queries,
    };
    const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
    const dir = join(ROOT, '.garisek', 'spec', 'throughput');
    mkdirSync(dir, { recursive: true });
    const out = join(dir, `${dayKey}.json`);
    writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);

    console.log(`throughput ${org.slug} · last ${days}d (${receipt.window.from} → ${receipt.window.to})\n`);
    console.log(formatReport(steps, daily));
    console.log(`\nreceipt: ${out}`);
  } finally {
    await pool.end();
    if (tenantPool !== pool) await tenantPool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
