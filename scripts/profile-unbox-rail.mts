/**
 * Ad-hoc profiler (NOT wired into CI) — time EVERY query the
 * `/api/receiving-lines?view=unbox_opened` rail request runs, so the remaining
 * cost can be attributed instead of guessed. The route fires three pairs:
 * the main list + its count, and (for this view) the unbox-opened placeholder
 * list + count.
 *
 * The `--conditions=react-server` flag is REQUIRED: build-sql transitively
 * imports a `server-only`-guarded module whose Node shim throws unless the
 * react-server export condition selects its no-op twin.
 *
 * Run: NODE_OPTIONS='--conditions=react-server' npx tsx scripts/profile-unbox-rail.mts
 *      PRELIMIT=0 … to compare the unrestricted shape.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import {
  buildReceivingLinesListSql,
  buildUnboxOpenedPlaceholdersSql,
} from '@/lib/receiving/lines/build-sql';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';

const orgId = process.env.PW_ORG_ID?.trim() || DOGFOOD_ORG_ID;
const preLimit = process.env.PRELIMIT !== '0';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL missing');

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

async function time<T>(label: string, run: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await run();
  console.log(`${label.padEnd(34)} ${(performance.now() - t0).toFixed(1)} ms`);
  return out;
}

try {
  await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);

  const ranked = await time('rank ids (receiving_unbox)', () =>
    client.query<{ receiving_id: number }>(
      `SELECT ru.receiving_id FROM receiving_unbox ru
        WHERE ru.organization_id = $1 AND ru.opened_at IS NOT NULL
        ORDER BY ru.opened_at DESC LIMIT $2`,
      [orgId, 50],
    ),
  );
  const ids = ranked.rows.map((r) => Number(r.receiving_id));

  const qs = new URLSearchParams('view=unbox_opened&limit=50&offset=0');
  if (preLimit) qs.set('receiving_id_in', ids.join(','));
  const query = parseReceivingLinesQuery(qs);

  const built = buildReceivingLinesListSql({
    query,
    orgId,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: false,
  });
  await time('main list', () => client.query(built.list.sql, built.list.params as unknown[]));
  await time('main count', () => client.query(built.count.sql, built.count.params as unknown[]));

  const ph = buildUnboxOpenedPlaceholdersSql(query, orgId, true);
  await time('placeholder list', () => client.query(ph.list.sql, ph.list.params as unknown[]));
  await time('placeholder count', () => client.query(ph.count.sql, ph.count.params as unknown[]));
} finally {
  client.release();
  await pool.end();
}
