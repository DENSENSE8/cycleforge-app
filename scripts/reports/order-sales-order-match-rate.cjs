/**
 * READ-ONLY report — can `orders` (INTEGER spine) be bridged to `sales_orders`
 * (UUID commercial mirror)?
 *
 * Week 4 gate, docs/todo/order-details-page-EXECUTION-PLAN.md §3:
 * decision D5 says bridge the keyspaces with a nullable `orders.sales_order_id`
 * rather than adding money columns to `orders`. That is only worth doing if the
 * join key actually resolves. This measures it BEFORE any migration, because a
 * bridge that resolves for a minority of orders is worse than none — the
 * Financials section would render, and be blank, on most records.
 *
 * Match key: `orders.order_id` (TEXT) ↔ `sales_orders.reference_number`
 * (TEXT UNIQUE NOT NULL, indexed). Normalization mirrors
 * 2026-04-15_backfill_receiving_shipment_id.sql, which already uses
 * UPPER(REGEXP_REPLACE(x,'[^A-Za-z0-9]','','g')) for this family of joins.
 *
 * Writes nothing. Run: node scripts/reports/order-sales-order-match-rate.cjs
 */

const fs = require('fs');

for (const f of ['.env.local', '.env']) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

const pg = require('pg');

const NORM = `UPPER(REGEXP_REPLACE(%s, '[^A-Za-z0-9]', '', 'g'))`;

async function main() {
  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const section = (t) => console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`);
  const rows = async (sql, params = []) => (await c.query(sql, params)).rows;

  section('0 · Population');
  const pop = await rows(`
    SELECT
      (SELECT count(*) FROM orders)                                        AS orders_total,
      (SELECT count(*) FROM orders WHERE NULLIF(BTRIM(order_id),'') IS NOT NULL) AS orders_with_ref,
      (SELECT count(*) FROM sales_orders)                                  AS sales_orders_total,
      (SELECT count(DISTINCT organization_id) FROM orders)                 AS order_orgs,
      (SELECT count(DISTINCT organization_id) FROM sales_orders)           AS so_orgs
  `);
  console.log(pop[0]);

  if (Number(pop[0].sales_orders_total) === 0) {
    console.log('\n⚠️  sales_orders is EMPTY — the bridge has nothing to resolve to.');
    console.log('    GATE: FAIL. Do not ship the bridge migration; re-open D5.');
    await c.end();
    return;
  }

  section('1 · Match rate (exact, then normalized)');
  const match = await rows(`
    WITH o AS (
      SELECT id, organization_id, account_source,
             BTRIM(order_id) AS ref,
             ${NORM.replace('%s', 'BTRIM(order_id)')} AS norm
        FROM orders
       WHERE NULLIF(BTRIM(order_id),'') IS NOT NULL
    ),
    s AS (
      SELECT id, organization_id,
             BTRIM(reference_number) AS ref,
             ${NORM.replace('%s', 'BTRIM(reference_number)')} AS norm
        FROM sales_orders
    )
    SELECT
      count(*)                                                              AS orders_considered,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM s WHERE s.ref = o.ref AND s.organization_id = o.organization_id
      ))                                                                    AS exact_same_org,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM s WHERE s.norm = o.norm AND s.organization_id = o.organization_id
      ))                                                                    AS normalized_same_org,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM s WHERE s.norm = o.norm
      ))                                                                    AS normalized_any_org
      FROM o
  `);
  const m = match[0];
  const pct = (n) => `${((Number(n) / Number(m.orders_considered)) * 100).toFixed(1)}%`;
  console.log(m);
  console.log(`\n  exact (same org):      ${pct(m.exact_same_org)}`);
  console.log(`  normalized (same org): ${pct(m.normalized_same_org)}`);
  console.log(`  normalized (any org):  ${pct(m.normalized_any_org)}  ← >same-org means cross-tenant collisions`);

  section('2 · Per account_source (channel skew)');
  const perSource = await rows(`
    WITH o AS (
      SELECT id, organization_id, COALESCE(NULLIF(BTRIM(account_source),''), '(null)') AS src,
             ${NORM.replace('%s', 'BTRIM(order_id)')} AS norm
        FROM orders
       WHERE NULLIF(BTRIM(order_id),'') IS NOT NULL
    ),
    s AS (
      SELECT organization_id, ${NORM.replace('%s', 'BTRIM(reference_number)')} AS norm
        FROM sales_orders
    )
    SELECT o.src,
           count(*) AS orders,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM s WHERE s.norm = o.norm AND s.organization_id = o.organization_id
           )) AS matched,
           ROUND(100.0 * count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM s WHERE s.norm = o.norm AND s.organization_id = o.organization_id
           )) / NULLIF(count(*),0), 1) AS pct
      FROM o
     GROUP BY o.src
     ORDER BY orders DESC
     LIMIT 25
  `);
  console.table(perSource);

  section('3 · Ambiguity (would the backfill be deterministic?)');
  const ambig = await rows(`
    WITH o AS (
      SELECT id, organization_id, ${NORM.replace('%s', 'BTRIM(order_id)')} AS norm
        FROM orders WHERE NULLIF(BTRIM(order_id),'') IS NOT NULL
    ),
    s AS (
      SELECT id, organization_id, ${NORM.replace('%s', 'BTRIM(reference_number)')} AS norm
        FROM sales_orders
    )
    SELECT count(*) AS orders_matching_multiple_sales_orders
      FROM o
     WHERE (SELECT count(*) FROM s WHERE s.norm = o.norm AND s.organization_id = o.organization_id) > 1
  `);
  console.log(ambig[0]);

  section('4 · Reverse coverage (mirror rows with no operational order)');
  const reverse = await rows(`
    WITH s AS (
      SELECT id, organization_id, ${NORM.replace('%s', 'BTRIM(reference_number)')} AS norm
        FROM sales_orders
    ),
    o AS (
      SELECT organization_id, ${NORM.replace('%s', 'BTRIM(order_id)')} AS norm
        FROM orders WHERE NULLIF(BTRIM(order_id),'') IS NOT NULL
    )
    SELECT count(*) AS sales_orders_total,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM o WHERE o.norm = s.norm AND o.organization_id = s.organization_id
           )) AS unmatched_sales_orders
      FROM s
  `);
  console.log(reverse[0]);

  section('5 · Sample unmatched orders (what is missing, concretely)');
  const sample = await rows(`
    WITH s AS (
      SELECT organization_id, ${NORM.replace('%s', 'BTRIM(reference_number)')} AS norm
        FROM sales_orders
    )
    SELECT o.id, o.order_id, o.account_source, o.created_at::date AS created
      FROM orders o
     WHERE NULLIF(BTRIM(o.order_id),'') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM s
          WHERE s.norm = ${NORM.replace('%s', 'BTRIM(o.order_id)')}
            AND s.organization_id = o.organization_id
       )
     ORDER BY o.created_at DESC NULLS LAST
     LIMIT 12
  `);
  console.table(sample);

  section('GATE');
  const rate = Number(m.normalized_same_org) / Number(m.orders_considered);
  console.log(`normalized same-org match rate: ${(rate * 100).toFixed(1)}%`);
  console.log(
    rate >= 0.8
      ? '✅ PASS — proceed with the bridge migration.'
      : rate >= 0.4
        ? '⚠️  PARTIAL — bridge would leave a large blank-Financials population. Re-open D5 before migrating.'
        : '❌ FAIL — the keyspaces do not share a usable join key. Do NOT ship the bridge; re-open D5.',
  );

  await c.end();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
