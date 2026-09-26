/**
 * Remove orders a ShipStation BACKFILL run inserted that are older than the
 * import scope (default: order date more than 7 days ago).
 *
 *   node --env-file=.env --import tsx scripts/remove-shipstation-backfill-inserts.mts --org=<uuid> --run=<id>            # dry run
 *   … --apply                                     # delete, one transaction
 *   … --keep-days=7                               # scope (default 7)
 *
 * Why: the first full-history backfill (2026-09-24) imported years of already
 * shipped orders; the owner's scope is the current week. Only rows the run
 * CREATED are candidates — identified as rows created during the run
 * (`shipstation_sync_runs.started_at` … `updated_at`; `orders.created_at` is
 * a timestamptz instant) that carry a `shipstation_order_refs` row and no adopted /
 * claimed ref (those name pre-existing rows). Pre-existing rows and the blanks
 * the run filled on them are never touched.
 *
 * A candidate with operator activity is KEPT and listed: a status other than
 * unassigned/shipped, or any row referencing it outside the system-written set
 * (hard FKs into orders.id other than the ShipStation refs and the packing-slip
 * cron's fetch jobs; polymorphic ORDER rows other than automation_runs /
 * entity_search_outbox / open unassigned work_assignments / marketplace-fetched
 * packing slips). Fetched slips' storage objects are left in the bucket. System rows are deleted with the order; the order delete
 * cascades the refs. Customers created during the run that nothing references
 * afterwards are deleted too. One transaction: any error rolls back all.
 */
import { Client } from 'pg';

const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const APPLY = args.includes('--apply');
const ORG = arg('org');
const RUN = Number(arg('run'));
const KEEP_DAYS = Number(arg('keep-days') ?? 7);
if (!ORG || !/^[0-9a-f-]{36}$/i.test(ORG) || !Number.isInteger(RUN)) {
  console.error('--org=<uuid> and --run=<shipstation_sync_runs.id> are required');
  process.exit(1);
}

// Written by jobs reacting to the insert (refs; the Ecwid packing-slip cron's fetch jobs).
const SYSTEM_FKS = new Set(['shipstation_order_refs', 'shipstation_shipment_refs', 'outbound_document_ingest_jobs']);
const SYSTEM_POLY = new Set(['automation_runs', 'entity_search_outbox']);
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  client.query<T>(sql, params).then((r) => r.rows);

await client.query('BEGIN');
try {
  await client.query(`SELECT set_config('app.current_org', $1, true)`, [ORG]);
  const [run] = await q<{ started_at: string; updated_at: string; mode: string }>(
    `SELECT started_at::text, updated_at::text, mode FROM shipstation_sync_runs WHERE organization_id = $1 AND id = $2`,
    [ORG, RUN],
  );
  if (!run) throw new Error(`run ${RUN} not found`);
  if (run.mode !== 'backfill') throw new Error(`run ${RUN} is ${run.mode}, not a backfill`);

  const created = await q<{ id: number; order_id: string; status: string | null; recent: boolean }>(
    `SELECT o.id, o.order_id, o.status, (o.order_date >= now() - ($4 || ' days')::interval) AS recent
       FROM orders o
      WHERE o.organization_id = $1
        AND o.created_at BETWEEN $2::timestamptz AND $3::timestamptz + interval '5 minutes'
        AND EXISTS (SELECT 1 FROM shipstation_order_refs r WHERE r.organization_id = o.organization_id AND r.order_row_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM shipstation_order_refs r WHERE r.organization_id = o.organization_id
                         AND r.order_row_id = o.id AND r.match_kind IN ('adopted', 'claimed'))`,
    [ORG, run.started_at, run.updated_at, String(KEEP_DAYS)],
  );
  const inScope = created.filter((r) => r.recent);
  let candidates = created.filter((r) => !r.recent);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}  org=${ORG}  run=${RUN}  keep ≤${KEEP_DAYS}d`);
  console.log(`orders created by the run: ${created.length}  (≤${KEEP_DAYS}d kept: ${inScope.length}, older: ${candidates.length})`);

  // ─── Operator activity → keep ───────────────────────────────────────────
  const keep = new Map<number, string[]>();
  const flag = (id: number, why: string) => keep.set(id, [...(keep.get(id) ?? []), why]);
  for (const c of candidates) if (!['unassigned', 'shipped', ''].includes(String(c.status ?? ''))) flag(c.id, `status ${c.status}`);
  const ids = () => candidates.map((c) => c.id);

  const fks = await q<{ tbl: string; col: string }>(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
       FROM pg_constraint c
       CROSS JOIN LATERAL generate_subscripts(c.confkey, 1) AS i
       JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[i] AND ra.attname = 'id'
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[i]
      WHERE c.contype = 'f' AND c.confrelid = 'public.orders'::regclass`,
  );
  for (const fk of fks) {
    if (SYSTEM_FKS.has(fk.tbl)) continue;
    const rows = await q<{ oid: number; n: number }>(
      `SELECT ${ident(fk.col)}::int AS oid, count(*)::int AS n FROM ${fk.tbl} WHERE ${ident(fk.col)} = ANY($1::int[]) GROUP BY 1`,
      [ids()],
    );
    for (const r of rows) flag(Number(r.oid), `${fk.tbl} ×${r.n}`);
  }
  const poly = await q<{ tbl: string; tcol: string; icol: string }>(
    `SELECT c1.table_name AS tbl, c1.column_name AS tcol, c2.column_name AS icol
       FROM information_schema.columns c1
       JOIN information_schema.columns c2 ON c2.table_schema = c1.table_schema AND c2.table_name = c1.table_name
        AND c2.column_name = replace(c1.column_name, '_type', '_id') AND c2.data_type IN ('integer', 'bigint')
       JOIN information_schema.tables t ON t.table_schema = c1.table_schema AND t.table_name = c1.table_name AND t.table_type = 'BASE TABLE'
      WHERE c1.table_schema = 'public' AND c1.column_name IN ('entity_type', 'owner_type', 'target_type', 'subject_type', 'ref_type')`,
  );
  const systemPoly: Array<{ tbl: string; tcol: string; icol: string; extra: string }> = [];
  for (const p of poly) {
    const isOrder = `upper(${ident(p.tcol)}::text) = 'ORDER'`;
    const rows = await q<{ oid: number; n: number }>(
      `SELECT ${ident(p.icol)}::int AS oid, count(*)::int AS n FROM ${ident(p.tbl)}
        WHERE ${isOrder} AND ${ident(p.icol)} = ANY($1::bigint[]) GROUP BY 1`,
      [ids()],
    );
    if (rows.length === 0) continue;
    if (SYSTEM_POLY.has(p.tbl)) {
      systemPoly.push({ ...p, extra: 'TRUE' });
      continue;
    }
    if (p.tbl === 'documents' || p.tbl === 'document_entity_links') {
      // The packing-slip cron's marketplace fetch is system; any other document
      // (an operator upload, a label, a link to an older document) is not.
      const human = await q<{ oid: number }>(
        p.tbl === 'documents'
          ? `SELECT DISTINCT entity_id::int AS oid FROM documents
              WHERE upper(entity_type::text) = 'ORDER' AND entity_id = ANY($1::bigint[])
                AND (document_data->>'source' IS DISTINCT FROM 'marketplace_api' OR created_at < $2::timestamptz)`
          : `SELECT DISTINCT l.entity_id::int AS oid FROM document_entity_links l JOIN documents d ON d.id = l.document_id
              WHERE upper(l.entity_type::text) = 'ORDER' AND l.entity_id = ANY($1::bigint[])
                AND (d.document_data->>'source' IS DISTINCT FROM 'marketplace_api' OR d.created_at < $2::timestamptz)`,
        [ids(), run.started_at],
      );
      for (const r of human) flag(Number(r.oid), `${p.tbl} (not a system fetch)`);
      systemPoly.push({ ...p, extra: 'TRUE' });
      continue;
    }
    if (p.tbl === 'work_assignments') {
      // An automation's open, unassigned TEST row is system; anything a person touched is not.
      const touched = await q<{ oid: number }>(
        `SELECT DISTINCT entity_id::int AS oid FROM work_assignments
          WHERE ${isOrder} AND entity_id = ANY($1::bigint[])
            AND (status::text <> 'OPEN' OR assigned_tech_id IS NOT NULL OR assigned_packer_id IS NOT NULL
                 OR assignee_staff_id IS NOT NULL OR started_at IS NOT NULL OR completed_at IS NOT NULL)`,
        [ids()],
      );
      for (const r of touched) flag(Number(r.oid), 'work_assignments (worked)');
      systemPoly.push({ ...p, extra: 'TRUE' });
      continue;
    }
    for (const r of rows) flag(Number(r.oid), `${p.tbl} ×${r.n}`);
  }
  const kept = candidates.filter((c) => keep.has(c.id));
  candidates = candidates.filter((c) => !keep.has(c.id));

  console.log(`to delete: ${candidates.length}   kept for operator activity: ${kept.length}`);
  for (const k of kept.slice(0, 50)) console.log(`  keep #${k.id} ${k.order_id}: ${keep.get(k.id)!.join(', ')}`);
  for (const p of systemPoly) {
    const [r] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${ident(p.tbl)} WHERE upper(${ident(p.tcol)}::text) = 'ORDER' AND ${ident(p.icol)} = ANY($1::bigint[])`,
      [ids()],
    );
    console.log(`  system rows removed with them: ${p.tbl} ${r.n}`);
  }
  const [refs] = await q<{ o: number; s: number }>(
    `SELECT (SELECT count(*)::int FROM shipstation_order_refs WHERE order_row_id = ANY($1::int[])) AS o,
            (SELECT count(*)::int FROM shipstation_shipment_refs WHERE order_row_id = ANY($1::int[])) AS s`,
    [ids()],
  );
  console.log(`  shipstation_order_refs removed (cascade): ${refs.o}; shipment refs unlinked: ${refs.s}`);

  // Customers created during the run, referenced only by the doomed orders.
  const custFks = await q<{ tbl: string; col: string }>(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'public.customers'::regclass AND array_length(c.conkey, 1) = 1
        AND c.conrelid <> 'public.orders'::regclass`,
  );
  const orphanCustomers = await q<{ id: number }>(
    `SELECT c.id FROM customers c
      WHERE c.organization_id = $1
        AND c.created_at BETWEEN $2::timestamptz AND $3::timestamptz + interval '5 minutes'
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND NOT (o.id = ANY($4::int[])))
        ${custFks.map((f) => `AND NOT EXISTS (SELECT 1 FROM ${f.tbl} x WHERE x.${ident(f.col)} = c.id)`).join('\n        ')}`,
    [ORG, run.started_at, run.updated_at, ids()],
  );
  console.log(`customers created by the run and referenced by nothing afterwards: ${orphanCustomers.length}`);

  if (!APPLY) {
    await client.query('ROLLBACK');
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    await client.end();
    process.exit(0);
  }

  // Links before documents before orders (jobs + refs cascade with the order).
  systemPoly.sort((a, b) => Number(b.tbl === 'document_entity_links') - Number(a.tbl === 'document_entity_links'));
  for (const p of systemPoly) {
    await client.query(
      `DELETE FROM ${ident(p.tbl)} WHERE upper(${ident(p.tcol)}::text) = 'ORDER' AND ${ident(p.icol)} = ANY($1::bigint[])`,
      [ids()],
    );
  }
  const del = await client.query(
    `DELETE FROM orders WHERE organization_id = $1 AND id = ANY($2::int[])`,
    [ORG, ids()],
  );
  if (del.rowCount !== candidates.length) throw new Error(`expected ${candidates.length} deletes, got ${del.rowCount}`);
  const delC = await client.query(`DELETE FROM customers WHERE organization_id = $1 AND id = ANY($2::int[])`, [
    ORG,
    orphanCustomers.map((c) => c.id),
  ]);
  await client.query('COMMIT');
  console.log(`\nAPPLIED: deleted ${del.rowCount} orders, ${delC.rowCount} customers.`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nFAILED — rolled back, nothing written:', e);
  process.exitCode = 1;
}
await client.end();
