/**
 * Merge the `shipstation` duplicates of marketplace orders into the marketplace
 * rows, then delete the duplicates.
 *
 *   node --env-file=.env --import tsx scripts/merge-shipstation-duplicate-orders.mts --org=<uuid>            # dry run
 *   node --env-file=.env --import tsx scripts/merge-shipstation-duplicate-orders.mts --org=<uuid> --apply
 *   … --since=2026-09-24T21:10:00Z   (default; the first ShipStation-only sync)
 *
 * Why: before the ingest writer learned to ADOPT (src/lib/orders/order-source-match.ts),
 * a ShipStation sync keyed orders on (account_source, order_id) and inserted a
 * `shipstation` copy of every order a marketplace lane had already landed.
 * The Sheets/Ecwid lanes match on order_id alone and COLLAPSE duplicates by
 * deleting the less-populated row, which could drop the marketplace row. This
 * script does what the fixed writer would have done: it folds each duplicate
 * into its marketplace row and removes it.
 *
 * Scope (strict): rows in `--org` with account_source = 'shipstation', created
 * at/after `--since`, where a non-shipstation row has the same btrim(order_id).
 * `shipstation` rows without a marketplace twin are genuine and are left alone.
 *
 * Per pair (ss → marketplace target; with several marketplace rows the target
 * is the one carrying a shipment, then the lowest id):
 *   1. every reference to the ss row moves to the target: hard FKs into
 *      orders.id (discovered from pg_constraint) and polymorphic refs
 *      (entity_type/owner_type = 'ORDER' + entity_id/owner_id). If the target
 *      already holds the equivalent row (same values on the rest of a unique
 *      index containing the ref column, or the same shipment for
 *      shipment_links), the ss-side ref is dropped instead;
 *   2. the target is backfilled with the adopt policy the writer uses
 *      (`planOrderRowBackfill` + `crossSourceBackfillPolicy('adopt')`): blanks
 *      and an untouched status only — including the ss row's shipment and
 *      customer when the target has none;
 *   3. the ss row is deleted.
 * All in ONE transaction: any error rolls back everything.
 *
 * Also reported: customers created since `--since` that nothing references
 * once the merge is done (listed, never deleted), and soft integer
 * `*order_id` columns without an FK that point at a duplicate id (listed for a
 * human; they are NOT rewritten because the column may name another table).
 *
 * `orders.created_at` is a timestamptz instant, so `--since` (an ISO instant)
 * is compared to it directly.
 */
import { Client } from 'pg';
import { planOrderRowBackfill } from '../src/lib/orders/order-row-backfill';
import type { BackfillRow } from '../src/lib/orders/order-row-backfill';
import { crossSourceBackfillPolicy } from '../src/lib/orders/order-source-match';

const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const APPLY = args.includes('--apply');
const ORG = arg('org');
const SINCE = arg('since') ?? '2026-09-24T21:10:00Z';

if (!ORG || !/^[0-9a-f-]{36}$/i.test(ORG)) {
  console.error('--org=<uuid> is required');
  process.exit(1);
}
if (Number.isNaN(Date.parse(SINCE))) {
  console.error(`--since is not a date: ${SINCE}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run with --env-file=.env.');
  process.exit(1);
}

type OrderRow = BackfillRow & { id: number; skuCatalogId: number | null; createdAt: string };

const ORDER_COLS = `id, order_id AS "orderId", item_number AS "itemNumber", product_title AS "productTitle",
  quantity, sku, condition, notes, customer_id AS "customerId", shipment_id::int AS "shipmentId",
  account_source AS "accountSource", status, sale_amount::text AS "saleAmount", currency,
  sku_catalog_id AS "skuCatalogId", created_at::text AS "createdAt"`;

/** camelCase backfill keys → orders columns. */
const COLUMN: Record<string, string> = {
  orderId: 'order_id',
  itemNumber: 'item_number',
  productTitle: 'product_title',
  quantity: 'quantity',
  sku: 'sku',
  condition: 'condition',
  notes: 'notes',
  skuCatalogId: 'sku_catalog_id',
  saleAmount: 'sale_amount',
  currency: 'currency',
  shipmentId: 'shipment_id',
  customerId: 'customer_id',
  status: 'status',
  accountSource: 'account_source',
};

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

interface RefSource {
  label: string;
  table: string;
  column: string;
  /** SQL cast for the id column (`int4`, `int8`, `text`, …). */
  cast: string;
  /** Extra predicate on the referencing row aliased `alias` (polymorphic type column). */
  where: (alias: string) => string;
  /** Column sets that define "the same reference" on the target. */
  equivalence: string[][];
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  client.query<T>(sql, params).then((r) => r.rows);

await client.query('BEGIN');
try {
  await client.query(`SELECT set_config('app.current_org', $1, true)`, [ORG]);

  // ─── Pairs ────────────────────────────────────────────────────────────
  const candidates = await q<{ ss_id: number; mk_id: number | null; status: string | null }>(
    `SELECT s.id AS ss_id, s.status,
            (SELECT m.id FROM orders m
              WHERE m.organization_id = s.organization_id
                AND btrim(m.order_id) = btrim(s.order_id)
                AND m.id <> s.id
                AND lower(btrim(coalesce(m.account_source, ''))) <> 'shipstation'
              ORDER BY (m.shipment_id IS NULL), m.id
              LIMIT 1) AS mk_id
       FROM orders s
      WHERE s.organization_id = $1
        AND s.account_source = 'shipstation'
        AND s.created_at >= $2::timestamptz`,
    [ORG, SINCE],
  );
  const pairs = candidates.filter((c) => c.mk_id != null).map((c) => ({ ss: c.ss_id, mk: c.mk_id! }));
  const keepers = candidates.filter((c) => c.mk_id == null);
  const statusSplit: Record<string, number> = {};
  for (const k of keepers) statusSplit[k.status ?? '(null)'] = (statusSplit[k.status ?? '(null)'] ?? 0) + 1;

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}  org=${ORG}  since=${SINCE}`);
  console.log(`shipstation rows in scope: ${candidates.length}`);
  console.log(`  duplicates of a marketplace row (pairs): ${pairs.length}`);
  console.log(`  genuine (no marketplace twin, left alone): ${keepers.length}`, statusSplit);
  const mkTargets = new Set(pairs.map((p) => p.mk));
  if (mkTargets.size !== pairs.length) throw new Error('two duplicates map to one marketplace row — refusing');
  if (pairs.length === 0) {
    await client.query('ROLLBACK');
    await client.end();
    process.exit(0);
  }

  await client.query(`CREATE TEMP TABLE merge_map (ss_id int PRIMARY KEY, mk_id int NOT NULL UNIQUE) ON COMMIT DROP`);
  await client.query(
    `INSERT INTO merge_map (ss_id, mk_id) SELECT * FROM unnest($1::int[], $2::int[])`,
    [pairs.map((p) => p.ss), pairs.map((p) => p.mk)],
  );
  const ssIds = pairs.map((p) => p.ss);

  // ─── Reference discovery ──────────────────────────────────────────────
  const uniqueColumnSets = async (table: string, column: string): Promise<string[][]> => {
    const rows = await q<{ cols: string[] }>(
      `SELECT array_agg(a.attname ORDER BY k.ord)::text[] AS cols
         FROM pg_index i
         CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE i.indrelid = $1::regclass AND i.indisunique AND NOT i.indisprimary
        GROUP BY i.indexrelid
       HAVING bool_or(a.attname = $2)`,
      [table, column],
    );
    return rows.map((r) => r.cols.filter((c) => c !== column));
  };

  const sources: RefSource[] = [];
  const hardFks = await q<{ tbl: string; col: string; typ: string }>(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, format_type(a.atttypid, a.atttypmod) AS typ
       FROM pg_constraint c
       CROSS JOIN LATERAL generate_subscripts(c.confkey, 1) AS i
       JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[i] AND ra.attname = 'id'
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[i]
      WHERE c.contype = 'f' AND c.confrelid = 'public.orders'::regclass`,
  );
  for (const fk of hardFks) {
    sources.push({
      label: `${fk.tbl}.${fk.col} (FK)`,
      table: fk.tbl,
      column: fk.col,
      cast: fk.typ,
      where: () => 'TRUE',
      equivalence: await uniqueColumnSets(fk.tbl, fk.col),
    });
  }
  const poly = await q<{ tbl: string; tcol: string; icol: string; typ: string }>(
    `SELECT c1.table_name AS tbl, c1.column_name AS tcol, c2.column_name AS icol,
            format_type(a.atttypid, a.atttypmod) AS typ
       FROM information_schema.columns c1
       JOIN information_schema.columns c2
         ON c2.table_schema = c1.table_schema AND c2.table_name = c1.table_name
        AND c2.column_name = replace(c1.column_name, '_type', '_id')
       JOIN information_schema.tables t
         ON t.table_schema = c1.table_schema AND t.table_name = c1.table_name AND t.table_type = 'BASE TABLE'
       JOIN pg_attribute a
         ON a.attrelid = format('%I.%I', c1.table_schema, c1.table_name)::regclass AND a.attname = c2.column_name
      WHERE c1.table_schema = 'public'
        AND c1.column_name IN ('entity_type', 'owner_type', 'target_type', 'subject_type', 'ref_type')
        AND c2.data_type IN ('integer', 'bigint', 'text', 'character varying')`,
  );
  for (const p of poly) {
    const equivalence = await uniqueColumnSets(p.tbl, p.icol);
    // shipment_links has no unique (owner, shipment) index; the same shipment
    // linked to both rows is the same link.
    if (p.tbl === 'shipment_links') equivalence.push([p.tcol, 'shipment_id']);
    sources.push({
      label: `${p.tbl}.${p.icol} (${p.tcol}='ORDER')`,
      table: p.tbl,
      column: p.icol,
      cast: p.typ,
      where: (alias) => `upper(${alias}.${ident(p.tcol)}::text) = 'ORDER'`,
      equivalence,
    });
  }

  const refMatch = (s: RefSource, alias: string, idExpr: string) =>
    `${alias}.${ident(s.column)}::text = ${idExpr}::text`;
  const equivalentExists = (s: RefSource) =>
    s.equivalence.length === 0
      ? 'FALSE'
      : s.equivalence
          .map(
            (cols) =>
              `EXISTS (SELECT 1 FROM ${s.table} x WHERE ${refMatch(s, 'x', 'mm.mk_id')}
                 AND ${s.where('x')}
                 ${cols.map((c) => `AND x.${ident(c)} IS NOT DISTINCT FROM r.${ident(c)}`).join(' ')})`,
          )
          .join(' OR ');

  console.log('\nReferences to the duplicates (move = repoint to the marketplace row; drop = target already has it):');
  const plan: Array<{ s: RefSource; total: number; drop: number }> = [];
  for (const s of sources) {
    const [row] = await q<{ total: number; drop: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE ${equivalentExists(s)})::int AS drop
         FROM ${s.table} r JOIN merge_map mm ON ${refMatch(s, 'r', 'mm.ss_id')}
        WHERE ${s.where('r')}`,
    );
    if (row.total > 0) {
      plan.push({ s, ...row });
      console.log(`  ${s.label.padEnd(58)} move ${row.total - row.drop}  drop ${row.drop}`);
    }
  }
  if (plan.length === 0) console.log('  (none)');

  const soft = await q<{ tbl: string; col: string }>(
    `SELECT col.table_name AS tbl, col.column_name AS col
       FROM information_schema.columns col
       JOIN information_schema.tables t ON t.table_schema = col.table_schema AND t.table_name = col.table_name
        AND t.table_type = 'BASE TABLE'
      WHERE col.table_schema = 'public' AND col.data_type IN ('integer', 'bigint')
        AND col.column_name LIKE '%order_id' AND col.table_name <> 'orders'`,
  );
  const covered = new Set(sources.map((s) => `${s.table}.${s.column}`));
  const softHits: string[] = [];
  for (const s of soft) {
    if (covered.has(`${s.tbl}.${s.col}`) || covered.has(`public.${s.tbl}.${s.col}`)) continue;
    const [row] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${ident(s.tbl)} WHERE ${ident(s.col)} = ANY($1::int[])`,
      [ssIds],
    );
    if (row.n > 0) softHits.push(`${s.tbl}.${s.col}: ${row.n}`);
  }
  console.log('\nSoft *order_id int columns (no FK) pointing at a duplicate id — NOT rewritten, check by hand:');
  console.log(softHits.length ? softHits.map((h) => `  ${h}`).join('\n') : '  (none)');

  // ─── Target backfill (adopt policy) ───────────────────────────────────
  const ssRows = new Map(
    (await q<OrderRow>(`SELECT ${ORDER_COLS} FROM orders WHERE id = ANY($1::int[])`, [ssIds])).map((r) => [r.id, r]),
  );
  const mkRows = new Map(
    (await q<OrderRow>(`SELECT ${ORDER_COLS} FROM orders WHERE id = ANY($1::int[])`, [pairs.map((p) => p.mk)])).map(
      (r) => [r.id, r],
    ),
  );
  const policy = { ...crossSourceBackfillPolicy('adopt', false), statusAuthoritative: true };
  const updates: Array<{ mk: number; values: Record<string, unknown> }> = [];
  const fieldCounts: Record<string, number> = {};
  let shipmentConflicts = 0;
  for (const { ss, mk } of pairs) {
    const s = ssRows.get(ss)!;
    const m = mkRows.get(mk)!;
    if (s.shipmentId != null && m.shipmentId != null && s.shipmentId !== m.shipmentId) shipmentConflicts++;
    const { values } = planOrderRowBackfill(
      m,
      {
        orderId: String(s.orderId ?? '').trim(),
        itemNumber: s.itemNumber ?? '',
        productTitle: s.productTitle ?? '',
        sku: s.sku ?? '',
        skuCatalogId: s.skuCatalogId,
        quantity: s.quantity ?? '',
        condition: s.condition ?? '',
        notes: s.notes ?? '',
        status: s.status,
        saleAmount: s.saleAmount ?? null,
        currency: s.currency ?? null,
        accountSource: s.accountSource ?? '',
        customerId: s.customerId,
        shipmentIds: s.shipmentId != null ? [s.shipmentId] : [],
      },
      policy,
    );
    if (Object.keys(values).length > 0) updates.push({ mk, values });
    for (const k of Object.keys(values)) fieldCounts[k] = (fieldCounts[k] ?? 0) + 1;
  }
  console.log(`\nMarketplace rows backfilled from their duplicate: ${updates.length}`, fieldCounts);
  console.log(`  both rows carry a DIFFERENT shipment (ss shipment left unlinked): ${shipmentConflicts}`);

  // ─── Orphaned customers ───────────────────────────────────────────────
  const movedCustomers = new Set(
    updates.map((u) => u.values.customerId).filter((v): v is number => typeof v === 'number'),
  );
  const custFks = await q<{ tbl: string; col: string }>(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'public.customers'::regclass AND array_length(c.conkey, 1) = 1`,
  );
  const otherCustomerRefs = custFks
    .filter((f) => f.tbl !== 'orders')
    .map((f) => `EXISTS (SELECT 1 FROM ${f.tbl} x WHERE x.${ident(f.col)} = c.id)`);
  const orphans = await q<{ id: number; created_at: string; order_id: string | null }>(
    `SELECT c.id, c.created_at::text, c.order_id
       FROM customers c
      WHERE c.organization_id = $1
        AND c.created_at >= $2::timestamptz
        AND c.id IN (SELECT customer_id FROM orders WHERE id = ANY($3::int[]) AND customer_id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND NOT (o.id = ANY($3::int[])))
        AND NOT (c.id = ANY($4::int[]))
        ${otherCustomerRefs.length ? `AND NOT (${otherCustomerRefs.join(' OR ')})` : ''}
      ORDER BY c.id`,
    [ORG, SINCE, ssIds, Array.from(movedCustomers)],
  );
  console.log(`\nCustomers created by the run that end up referenced by nothing (NOT deleted): ${orphans.length}`);
  for (const o of orphans.slice(0, 50)) console.log(`  #${o.id} created ${o.created_at} order_id=${o.order_id ?? ''}`);
  if (orphans.length > 50) console.log(`  … ${orphans.length - 50} more`);

  console.log(`\nRows to delete (orders, account_source='shipstation'): ${pairs.length}`);

  if (!APPLY) {
    await client.query('ROLLBACK');
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    await client.end();
    process.exit(0);
  }

  // ─── Apply ────────────────────────────────────────────────────────────
  for (const { s } of plan) {
    if (s.equivalence.length > 0) {
      const dropped = await client.query(
        `DELETE FROM ${s.table} r USING merge_map mm
          WHERE ${refMatch(s, 'r', 'mm.ss_id')} AND ${s.where('r')} AND (${equivalentExists(s)})`,
      );
      if (dropped.rowCount) console.log(`  dropped ${dropped.rowCount} from ${s.label}`);
    }
    const moved = await client.query(
      `UPDATE ${s.table} r SET ${ident(s.column)} = mm.mk_id::${s.cast}
         FROM merge_map mm WHERE ${refMatch(s, 'r', 'mm.ss_id')} AND ${s.where('r')}`,
    );
    if (moved.rowCount) console.log(`  moved ${moved.rowCount} in ${s.label}`);
  }
  // Free the duplicate's shipment/customer before the target takes them.
  await client.query(`UPDATE orders SET shipment_id = NULL, customer_id = NULL WHERE id = ANY($1::int[])`, [ssIds]);
  for (const { mk, values } of updates) {
    const keys = Object.keys(values);
    await client.query(
      `UPDATE orders SET ${keys.map((k, i) => `${COLUMN[k]} = $${i + 2}`).join(', ')}
        WHERE id = $1 AND organization_id = $${keys.length + 2}`,
      [mk, ...keys.map((k) => values[k]), ORG],
    );
  }
  const deleted = await client.query(
    `DELETE FROM orders WHERE id = ANY($1::int[]) AND organization_id = $2 AND account_source = 'shipstation'`,
    [ssIds, ORG],
  );
  if (deleted.rowCount !== pairs.length) {
    throw new Error(`expected to delete ${pairs.length} rows, deleted ${deleted.rowCount} — rolling back`);
  }
  await client.query('COMMIT');
  console.log(`\nAPPLIED: merged + deleted ${deleted.rowCount} duplicate rows.`);
  console.log('Merged pairs (ss → marketplace):');
  console.log(JSON.stringify(pairs));
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nFAILED — rolled back, nothing written:', e);
  process.exitCode = 1;
}
await client.end();
