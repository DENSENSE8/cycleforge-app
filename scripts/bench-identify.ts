/**
 * Latency bench for `identify` — the domain function in-process against the
 * dev DB, uncached, p50/p95 per identifier class.
 *
 *   tsx --conditions=react-server scripts/bench-identify.ts [--runs 20] [--org <uuid>]
 *
 * Safety: every statement runs as the tenant runtime role (RLS on) on the
 * UNPOOLED host, inside `BEGIN READ ONLY … ROLLBACK` — the same single
 * simple-protocol message `tenantQueryOneTrip` sends (one round trip), so the
 * numbers are the production path's round-trip count with writes impossible.
 * Fixtures are sampled read-only from the org's own rows.
 *
 * Requires the Brands migrations. If the Perf SAL generated columns are
 * absent the bench says so and expands them to their jsonb definitions.
 *
 * Budgets (BACKEND-HANDOFF Phase 3): exact identifiers p95 < 150 ms, free
 * text p95 < 400 ms. Exit 1 when a budget is missed.
 */

import { readFileSync } from 'node:fs';
import type { IdentifyDeps } from '@/lib/identify/identify';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const EXACT_BUDGET_MS = 150;
const FREE_TEXT_BUDGET_MS = 400;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Point both pools at the unpooled host BEFORE any db module loads (never the PgBouncer DSN). */
function useUnpooledHosts(): void {
  const env = Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  const unpooled = env.DATABASE_URL_UNPOOLED;
  const tenant = env.TENANT_APP_DATABASE_URL;
  if (!unpooled || !tenant) throw new Error('bench-identify: DATABASE_URL_UNPOOLED and TENANT_APP_DATABASE_URL are required');
  process.env.DATABASE_URL = unpooled;
  process.env.TENANT_APP_DATABASE_URL = tenant.replace('-pooler.', '.');
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main(): Promise<void> {
  useUnpooledHosts();
  const orgId = arg('org', DEFAULT_ORG);
  const runs = Math.max(3, Number(arg('runs', '20')));
  // Dynamic on purpose: `@/lib/db` builds its pools from process.env at module
  // load, and a static import would hoist above useUnpooledHosts().
  const { tenantPool } = await import('@/lib/db');
  const { inlineSqlParams } = await import('@/lib/tenancy/inline-params');
  const { identify, defaultIdentifyDeps } = await import('@/lib/identify/identify');

  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error(`bad --org ${orgId}`);

  /** One message: read-only transaction, org GUC, statement, rollback. */
  async function readOnly<R>(sql: string, params: unknown[] = []): Promise<{ rows: R[] }> {
    const client = await tenantPool.connect();
    try {
      const results = (await client.query(
        `BEGIN READ ONLY;\nSELECT set_config('app.current_org', '${orgId}', true);\n${inlineSqlParams(sql, params)};\nROLLBACK;`,
      )) as unknown as Array<{ rows: R[] }>;
      return results[results.length - 2];
    } finally {
      client.release();
    }
  }

  const [{ role }] = (await readOnly<{ role: string }>('SELECT current_user AS role')).rows;
  const [schema] = (
    await readOnly<{ brands: boolean; sal_cols: boolean }>(
      `SELECT to_regclass('public.product_brands') IS NOT NULL
              AND EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name = 'sku_catalog' AND column_name = 'brand_id') AS brands,
              EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'station_activity_logs' AND column_name = 'order_row_id') AS sal_cols`,
    )
  ).rows;

  const notes: string[] = [`role=${role} (RLS subject), host=unpooled, BEGIN READ ONLY … ROLLBACK, cache bypassed`];
  const expandSal = (sql: string) =>
    schema.sal_cols
      ? sql
      : sql
          .replace(/sal\.order_row_id/g, () => "(CASE WHEN (sal.metadata->>'order_row_id') ~ '^[0-9]+$' THEN (sal.metadata->>'order_row_id')::int END)")
          .replace(/sal\.ext_order_id/g, () => "(sal.metadata->>'order_id')");
  if (!schema.sal_cols) notes.push('PRE-APPLY: SAL generated columns absent → expanded to their jsonb definitions (slower than post-apply)');
  if (!schema.brands) throw new Error('bench-identify: brand tables absent — apply the Brands migrations first');

  const deps: IdentifyDeps = {
    query: (_org, sql, params) => readOnly(expandSal(sql), params),
    brandSql: defaultIdentifyDeps.brandSql,
    cache: (_org, _key, load) => load(),
  };

  // ── Fixtures: one real value per identifier kind, sampled read-only ──────
  const [f] = (
    await readOnly<Record<string, string | null>>(`
      SELECT
        (SELECT order_id FROM orders WHERE organization_id = $1 AND order_id ~ '^\\d{3}-\\d{7}-\\d{7}$' ORDER BY md5(id::text) LIMIT 1) AS order_amazon,
        (SELECT order_id FROM orders WHERE organization_id = $1 AND order_id ~ '^\\d{2}-\\d{5}-\\d{5}$' ORDER BY md5(id::text) LIMIT 1) AS order_ebay,
        (SELECT order_id FROM orders WHERE organization_id = $1 AND order_id ~ '^\\d{3,9}$' ORDER BY md5(id::text) LIMIT 1) AS order_numeric,
        (SELECT item_number FROM orders WHERE organization_id = $1 AND length(item_number) >= 6 ORDER BY md5(id::text) LIMIT 1) AS marketplace_item,
        (SELECT stn.tracking_number_raw FROM orders o JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id AND stn.organization_id = o.organization_id
          WHERE o.organization_id = $1 ORDER BY md5(o.id::text) LIMIT 1) AS tracking,
        (SELECT serial_number FROM tech_serial_numbers WHERE organization_id = $1 AND order_id IS NOT NULL ORDER BY md5(id::text) LIMIT 1) AS serial_order,
        (SELECT serial_number FROM serial_units WHERE organization_id = $1 ORDER BY md5(id::text) LIMIT 1) AS serial_unit,
        (SELECT sku FROM sku_catalog WHERE organization_id = $1 AND sku ~ '\\d' ORDER BY md5(id::text) LIMIT 1) AS sku,
        (SELECT gtin FROM sku_catalog WHERE organization_id = $1 AND gtin ~ '^\\d{14}$' ORDER BY md5(id::text) LIMIT 1) AS gtin,
        (SELECT upc FROM items WHERE organization_id = $1 AND upc ~ '^\\d{12}$' ORDER BY md5(id::text) LIMIT 1) AS upc,
        (SELECT fnsku FROM fba_fnskus WHERE organization_id = $1 AND fnsku ~ '^X00' ORDER BY md5(fnsku) LIMIT 1) AS fnsku,
        (SELECT zoho_purchaseorder_number FROM receiving_carton WHERE organization_id = $1 AND zoho_purchaseorder_number IS NOT NULL ORDER BY md5(id::text) LIMIT 1) AS po,
        (SELECT 'R-' || id FROM receiving_carton WHERE organization_id = $1 ORDER BY md5(id::text) LIMIT 1) AS handle_r,
        (SELECT 'U-' || id FROM serial_units WHERE organization_id = $1 ORDER BY md5(id::text) LIMIT 1) AS handle_u,
        (SELECT 'https://id.gs1.org/01/' || gtin FROM sku_catalog WHERE organization_id = $1 AND gtin ~ '^\\d{14}$' ORDER BY md5(id::text) LIMIT 1) AS gs1_digital_link`,
      [orgId],
    )
  ).rows;

  const exactFixtures = Object.entries(f).filter((e): e is [string, string] => Boolean(e[1]));
  const freeText: Array<[string, string]> = [
    ['bose', 'bose'],
    ['guitar hero', 'guitar hero'],
    ['jbl flip', 'jbl flip'],
    ['bsoe (typo)', 'bsoe'],
    ['bose 700 used', 'bose 700 used'],
  ];
  const batch: Array<[string, string]> = [['batch ×' + exactFixtures.length, exactFixtures.map((e) => e[1]).join('\n')]];

  interface Row { cls: string; group: 'exact' | 'free text' | 'batch'; input: string; p50: number; p95: number; max: number; mode: string; top: string }
  const table: Row[] = [];

  async function bench(group: Row['group'], cls: string, q: string): Promise<void> {
    const first = await identify(orgId, { q }, deps); // warm-up (connection + plan cache); not timed
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t = performance.now();
      await identify(orgId, { q }, deps);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const line = first.lines[0];
    const top = line?.candidates[0];
    table.push({
      cls,
      group,
      input: q.includes('\n') ? `${q.split('\n').length} lines` : q.slice(0, 40),
      p50: Math.round(percentile(times, 50)),
      p95: Math.round(percentile(times, 95)),
      max: Math.round(times[times.length - 1]),
      mode: group === 'batch' ? `${first.lines.filter((l) => l.mode !== 'none').length}/${first.lines.length} hit` : first.mode,
      top: top ? `${top.kind}:${top.entityId} ${top.matchedOn.field} ${top.stage ?? ''} ${top.title.slice(0, 32)}` : '—',
    });
  }

  for (const [cls, q] of exactFixtures) await bench('exact', cls, q);
  for (const [cls, q] of freeText) await bench('free text', cls, q);
  for (const [cls, q] of batch) await bench('batch', cls, q);

  console.log(notes.map((n) => `# ${n}`).join('\n'));
  console.log(`# ${runs} timed runs per class after 1 warm-up; ms wall, in-process`);
  console.table(table.map(({ group, cls, input, p50, p95, max, mode, top }) => ({ group, class: cls, input, p50, p95, max, mode, top })));

  const pooled = (g: Row['group']) => table.filter((r) => r.group === g).map((r) => r.p95);
  const worst = (g: Row['group']) => Math.max(...pooled(g));
  const exactWorst = worst('exact');
  const ftWorst = worst('free text');
  console.log(`exact worst-class p95 ${exactWorst} ms (budget ${EXACT_BUDGET_MS}) · free text worst-class p95 ${ftWorst} ms (budget ${FREE_TEXT_BUDGET_MS})`);
  process.exitCode = exactWorst < EXACT_BUDGET_MS && ftWorst < FREE_TEXT_BUDGET_MS ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 50));
