/**
 * Mark every unboxed line received (operator order, 2026-10-04).
 *
 *   tsx --conditions=react-server scripts/receive-unboxed-lines.ts [--org <uuid>] [--verbose]   (dry run)
 *   … --apply   (writes — only with the operator's approval)
 *
 * `--org` limits the run to one org (the list of every org with such lines still prints).
 * A line whose carton Unbox opened or completed (receiving_unbox.unboxed_at /
 * opened_at, or an unbox-surface scan — `receiveImportedLineIfCartonUnboxed`'s
 * own test) and that counts fewer units than it expects is local-received to
 * its expected quantity and DONE through THE house path,
 * `receiveImportedLineIfCartonUnboxed` → `receiveLineUnits` (no Zoho write;
 * idempotent on `inbound-unboxed-receive:<line>`).
 *
 * Never received here, listed instead: a line with no expected quantity; a
 * line on a carton held (carton exception code, an OPEN receiving exception
 * on the carton or line, carton disposition HOLD); a line QC already closed
 * (FAILED / RTV / SCRAP); a line that duplicates another line's purchase
 * (`duplicatePurchaseLineIds` — receiving it would count stock twice).
 *
 * Every org with such lines is visited (listed through the owner pool; each
 * org's reads and writes run on its tenant role, RLS on). Dry run: read-only.
 */

import { readFileSync } from 'node:fs';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

const LINE_LIMIT = 2000;

/** Point both pools at the unpooled host BEFORE any db module loads (as scripts/bench-identify.ts). */
function useUnpooledHosts(): void {
  const env = Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  if (!env.DATABASE_URL_UNPOOLED || !env.TENANT_APP_DATABASE_URL) {
    throw new Error('receive-unboxed: DATABASE_URL_UNPOOLED and TENANT_APP_DATABASE_URL are required');
  }
  process.env.DATABASE_URL = env.DATABASE_URL_UNPOOLED;
  process.env.TENANT_APP_DATABASE_URL = env.TENANT_APP_DATABASE_URL.replace('-pooler.', '.');
}

interface Candidate {
  id: number;
  receiving_id: number;
  quantity_expected: number | null;
  quantity_received: number;
  workflow_status: string;
  sku: string | null;
  inbound_source_type: string | null;
  source_order_id: string | null;
  zoho_purchaseorder_id: string | null;
  zoho_purchaseorder_number: string | null;
  tracking_number: string | null;
  held: string | null;
}

const QC_CLOSED = new Set(['FAILED', 'RTV', 'SCRAP']);

async function main(): Promise<void> {
  useUnpooledHosts();
  const apply = process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');
  const orgIndex = process.argv.indexOf('--org');
  const onlyOrg = orgIndex > 0 ? process.argv[orgIndex + 1] ?? null : null;

  // Dynamic on purpose: `@/lib/db` builds its pools from process.env at module load.
  const { default: pool, tenantPool } = await import('@/lib/db');
  const { inlineSqlParams } = await import('@/lib/tenancy/inline-params');
  const { receiveImportedLineIfCartonUnboxed } = await import('@/lib/inbound/receive-if-carton-unboxed');
  const { duplicatePurchaseLineIds } = await import('@/lib/receiving/pasted-number-facts');

  const UNBOXED_SQL = `(ru.unboxed_at IS NOT NULL OR ru.opened_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM receiving_scans rs WHERE rs.receiving_id = rl.receiving_id AND rs.intake_surface = 'unbox'))`;

  // Orgs with an unboxed line still short of what it expects (owner pool: a list of ids, nothing else).
  const orgs = (
    await pool.query<{ organization_id: string; n: number }>(
      `SELECT rl.organization_id, count(*)::int AS n
         FROM receiving_line rl
         LEFT JOIN receiving_unbox ru ON ru.receiving_id = rl.receiving_id AND ru.organization_id = rl.organization_id
        WHERE rl.receiving_id IS NOT NULL AND ${UNBOXED_SQL}
          AND (rl.quantity_expected IS NULL OR COALESCE(rl.quantity_received, 0) < rl.quantity_expected)
        GROUP BY 1 ORDER BY 1`,
    )
  ).rows;
  const total = orgs.reduce((n, o) => n + o.n, 0);
  console.log(`${apply ? 'APPLY' : 'DRY RUN (read-only; --apply writes)'} · orgs: ${orgs.length} · unboxed lines short or without expected qty: ${total}`);
  if (total > LINE_LIMIT) {
    console.log(`STOP: ${total} lines > ${LINE_LIMIT} — far beyond the pasted list; nothing done.`);
    return;
  }

  for (const { organization_id: orgId } of orgs) {
    if (onlyOrg && orgId !== onlyOrg) {
      console.log(`\n== org ${orgId}: not in this run (--org ${onlyOrg})`);
      continue;
    }
    async function readOnly<R>(sql: string, params: unknown[] = []): Promise<R[]> {
      const client = await tenantPool.connect();
      try {
        const results = (await client.query(
          `BEGIN READ ONLY;\nSELECT set_config('app.current_org', '${orgId}', true);\n${inlineSqlParams(sql, params)};\nROLLBACK;`,
        )) as unknown as Array<{ rows: R[] }>;
        return results[results.length - 2].rows;
      } finally {
        client.release();
      }
    }
    const lines = await readOnly<Candidate>(
      `SELECT rl.id, rl.receiving_id, rl.quantity_expected, COALESCE(rl.quantity_received, 0)::int AS quantity_received,
              rl.workflow_status::text AS workflow_status, rl.sku, rl.inbound_source_type, rl.source_order_id,
              rz.zoho_purchaseorder_id, rz.zoho_purchaseorder_number, stn.tracking_number_raw AS tracking_number,
              CASE
                WHEN rc.exception_code IS NOT NULL THEN 'carton exception ' || rc.exception_code
                WHEN EXISTS (SELECT 1 FROM receiving_exceptions x
                              WHERE x.status = 'OPEN' AND (x.receiving_id = rl.receiving_id OR x.receiving_line_id = rl.id))
                  THEN 'open receiving exception'
                WHEN rc.disposition_code::text = 'HOLD' THEN 'carton disposition HOLD'
              END AS held
         FROM receiving_line rl
         JOIN receiving_carton rc ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
         LEFT JOIN receiving_unbox ru ON ru.receiving_id = rl.receiving_id AND ru.organization_id = rl.organization_id
         LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
        WHERE rl.organization_id = $1 AND ${UNBOXED_SQL}
          AND (rl.quantity_expected IS NULL OR COALESCE(rl.quantity_received, 0) < rl.quantity_expected)
        ORDER BY rl.receiving_id, rl.id`,
      [orgId],
    );
    // A purchase counts once: the duplicate of a Zoho PO line on the same carton set is never received.
    const byCarton = new Map<number, ReceivingLineRow[]>();
    for (const l of lines) {
      const row = { id: l.id, inbound_source_type: l.inbound_source_type, source_order_id: l.source_order_id, quantity_received: l.quantity_received, sku: l.sku, tracking_number: l.tracking_number, zoho_purchaseorder_id: l.zoho_purchaseorder_id, zoho_purchaseorder_number: l.zoho_purchaseorder_number } as ReceivingLineRow;
      const list = byCarton.get(l.receiving_id);
      if (list) list.push(row);
      else byCarton.set(l.receiving_id, [row]);
    }
    const duplicates = new Set([...byCarton.values()].flatMap((group) => [...duplicatePurchaseLineIds(group)]));

    const classify = (l: Candidate): string =>
      l.quantity_expected == null ? 'skip: no expected quantity'
        : duplicates.has(l.id) ? 'skip: duplicate of a Zoho PO line'
          : QC_CLOSED.has(l.workflow_status) ? `skip: QC closed (${l.workflow_status})`
            : l.held ? `skip: held — ${l.held}`
              : 'receive';
    const plan = lines.map((l) => ({ line: l, action: classify(l) }));
    const receive = plan.filter((p) => p.action === 'receive');
    const tally = (rows: typeof plan, key: (p: (typeof plan)[number]) => string) =>
      rows.reduce<Record<string, number>>((acc, p) => ({ ...acc, [key(p)]: (acc[key(p)] ?? 0) + 1 }), {});

    console.log(`\n== org ${orgId}`);
    console.log(`lines: ${lines.length} on ${new Set(lines.map((l) => l.receiving_id)).size} cartons`);
    for (const [action, n] of Object.entries(tally(plan, (p) => p.action.replace(/ — carton exception .*/, ' — carton exception')))) console.log(`  ${String(n).padStart(4)}  ${action}`);
    console.log(`to receive: ${receive.length} lines on ${new Set(receive.map((p) => p.line.receiving_id)).size} cartons · units to add: ${receive.reduce((n, p) => n + (p.line.quantity_expected! - p.line.quantity_received), 0)}`);
    console.log(`  by current state: ${JSON.stringify(tally(receive, (p) => p.line.workflow_status))}`);
    console.log(`  without a SKU (no stock ledger / inventory event is written for them): ${receive.filter((p) => !p.line.sku).length}`);
    for (const p of verbose ? plan : plan.filter((x) => x.action !== 'receive')) {
      const l = p.line;
      console.log(`  ${p.action.padEnd(40)} line ${l.id} carton ${l.receiving_id} ${l.quantity_received}/${l.quantity_expected ?? '?'} ${l.workflow_status} ${l.sku ?? '(no sku)'}`);
    }
    if (!apply) continue;

    const out = { received: 0, already: 0, failed: [] as string[] };
    for (const p of receive) {
      try {
        const hit = await receiveImportedLineIfCartonUnboxed(orgId as never, p.line.id);
        if (hit?.received) out.received += 1;
        else out.already += 1;
      } catch (err) {
        out.failed.push(`line ${p.line.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`applied: ${out.received} received · ${out.already} already complete / not unboxed on re-check · ${out.failed.length} failed`);
    for (const f of out.failed) console.log(`  ${f}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 50));
