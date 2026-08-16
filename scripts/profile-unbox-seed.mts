/**
 * Ad-hoc profiler (NOT wired into CI) — time the exact queries
 * `seedUnboxStation` now runs in-process, so a TTFB regression can be
 * attributed to one of them instead of guessed at.
 *
 * Run: NODE_OPTIONS='--conditions=react-server' npx tsx scripts/profile-unbox-seed.mts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import {
  buildReceivingLinesListSql,
  buildUnboxOpenedPlaceholdersSql,
  shouldIncludeUnboxOpenedPlaceholders,
} from '@/lib/receiving/lines/build-sql';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';

const orgId = process.env.PW_ORG_ID?.trim() || DOGFOOD_ORG_ID;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL missing');

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

async function time<T>(label: string, run: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await run();
  console.log(`${label.padEnd(38)} ${(performance.now() - t0).toFixed(0)} ms`);
  return out;
}

try {
  await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);

  const ranked = await time('rank ids', () =>
    client.query<{ receiving_id: number }>(
      `SELECT ru.receiving_id FROM receiving_unbox ru
        WHERE ru.organization_id = $1 AND ru.opened_at IS NOT NULL
        ORDER BY ru.opened_at DESC LIMIT 1`,
      [orgId],
    ),
  );
  const mru = Number(ranked.rows[0]?.receiving_id);
  console.log('mru =', mru);

  // --- rail seed shape ---
  const railParams = new URLSearchParams({
    limit: '50', offset: '0', view: 'unbox_opened', receiving_id_in: String(mru),
  });
  const railQuery = parseReceivingLinesQuery(railParams);
  const railBuilt = buildReceivingLinesListSql({
    query: railQuery, orgId, viewerStaffId: NaN,
    universalIncoming: false, applyScannedZohoExclusion: false, unboxRailColumnRead: true,
  });
  await time('rail: list', () => client.query(railBuilt.list.sql, railBuilt.list.params as unknown[]));
  console.log('  placeholders included?', shouldIncludeUnboxOpenedPlaceholders(railQuery));
  const ph = buildUnboxOpenedPlaceholdersSql(railQuery, orgId, true);
  await time('rail: placeholders', () => client.query(ph.list.sql, ph.list.params as unknown[]));

  // --- carton lines seed shape ---
  const lineParams = new URLSearchParams({ receiving_id: String(mru), include: 'serials' });
  const lineQuery = parseReceivingLinesQuery(lineParams);
  const lineBuilt = buildReceivingLinesListSql({
    query: lineQuery, orgId, viewerStaffId: NaN,
    universalIncoming: false, applyScannedZohoExclusion: false, unboxRailColumnRead: true,
  });
  await time('carton lines: list', () =>
    client.query(lineBuilt.list.sql, lineBuilt.list.params as unknown[]));
} finally {
  client.release();
  await pool.end();
}
