/**
 * Ecwid → caged intake batch: pull the newest N Ecwid orders, land them through
 * the shared order writer, and CAGE them so each one is verified in the intake
 * overlay before it reaches the live To-ship queue.
 *
 * This is the paced counterpart to the recurring connector sync. It adds no
 * import engine of its own:
 *   fetchEcwidCanonicalOrders  (the one Ecwid reader, windowed)
 *     → mapEcwidOrdersToCanonicalLines  (the one adapter; skips `-RS` services)
 *       → ingestCanonicalOrders          (the one order writer)
 *         → cageOrder                    (the one cage writer)
 *
 * DRY RUN BY DEFAULT. Nothing is written without `--apply`, because caging an
 * order removes it from the live queue until staff release it.
 *
 * Usage:
 *   pnpm ecwid:batch                  # dry run, newest 30
 *   pnpm ecwid:batch -- --limit=10    # dry run, newest 10
 *   pnpm ecwid:batch -- --apply       # write: ingest + cage
 *   pnpm ecwid:batch -- --apply --no-cage-existing   # only cage rows this run inserted
 */
import pool from '@/lib/db';
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { getIntegrationCredentials } from '@/lib/integrations/credentials';
import { fetchEcwidCanonicalOrders } from '@/lib/orders/sources/ecwid-orders';
import { ingestCanonicalOrders } from '@/lib/orders/ingest-canonical-orders';
import { cageOrder, getOrderReleaseRecord } from '@/lib/orders/caged-orders';

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const num = (name: string, fallback: number) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  const parsed = hit ? Number(hit.split('=')[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const APPLY = has('--apply');
const LIMIT = num('limit', 30);
const CAGE_EXISTING = !has('--no-cage-existing');
const ORG_ID = DOGFOOD_ORG_ID as OrgId;

function line(s = '') {
  process.stdout.write(`${s}\n`);
}

async function main() {
  line(`Ecwid intake batch — newest ${LIMIT} orders${APPLY ? '' : '   [DRY RUN]'}`);
  line(`org ${ORG_ID}`);

  // Vault first, env only as the dogfood fallback — same precedence the
  // connector sync uses, so this script cannot reach a store the app itself
  // would refuse to read.
  const vault = await getIntegrationCredentials<{ storeId?: string; apiToken?: string }>(
    ORG_ID,
    'ecwid',
  );
  const creds =
    vault?.storeId && vault?.apiToken
      ? { storeId: vault.storeId, token: vault.apiToken }
      : undefined;
  line(`credentials: ${creds ? 'vault' : 'env fallback (dogfood)'}`);

  const lines = await fetchEcwidCanonicalOrders(creds, {
    allowEnvFallback: true,
    // No date filter — "the newest N" regardless of age.
    window: { lookbackDays: null, limit: LIMIT },
  });
  const orderNumbers = [...new Set(lines.map((l) => l.externalOrderId))];
  line(
    `fetched ${LIMIT} Ecwid orders → ${lines.length} canonical line(s) across ` +
      `${orderNumbers.length} order(s) after the -RS service filter`,
  );

  // What already exists, so the report can separate INSERT from CAGE-EXISTING.
  const { rows: before } = await pool.query<{ order_id: string; id: number; release_state: string | null }>(
    `SELECT order_id, id, release_state FROM orders
      WHERE organization_id = $1 AND order_id = ANY($2)`,
    [ORG_ID, orderNumbers],
  );
  const existing = new Map(before.map((r) => [r.order_id, r]));
  line(`already in DB: ${existing.size}   new: ${orderNumbers.length - existing.size}`);

  if (!APPLY) {
    line('\n--apply not set; nothing written. Would ingest + cage:');
    for (const n of orderNumbers) {
      const e = existing.get(n);
      line(`  ${n.padEnd(8)} ${e ? `existing #${e.id} (state ${e.release_state ?? 'NULL'})` : 'INSERT'}`);
    }
    await pool.end();
    return;
  }

  const result = await ingestCanonicalOrders(lines, {
    orgId: ORG_ID,
    source: 'ecwid-intake-batch',
    // Never let a re-run delete an existing order (same guarantee the CSV
    // import lane states); the writer's additive backfill still fills blanks.
    collapseDuplicates: false,
    // No ship-by in Ecwid — do not manufacture deadline assignments.
    manageDeadlines: false,
  });
  line(
    `\ningest: processed=${result.processedOrders} inserted=${result.insertedOrders} ` +
      `trackingUpdated=${result.updatedOrdersTracking}`,
  );

  const { rows: after } = await pool.query<{ order_id: string; id: number }>(
    `SELECT order_id, id FROM orders WHERE organization_id = $1 AND order_id = ANY($2)`,
    [ORG_ID, orderNumbers],
  );
  const insertedIds = new Set(result.insertedOrderIds ?? []);

  let caged = 0;
  let skipped = 0;
  line('\ncaging:');
  for (const row of after) {
    const isNew = insertedIds.has(row.id);
    if (!isNew && !CAGE_EXISTING) {
      skipped += 1;
      continue;
    }
    // `cageOrder` refuses an explicitly-released order (it is live work on the
    // floor); a NULL-state legacy row is cageable.
    const ok = await cageOrder(ORG_ID, row.id);
    const rec = await getOrderReleaseRecord(ORG_ID, row.id);
    const gates = rec?.gates;
    const blocked = gates?.failing.map((g) => g.id).join(',') || 'none';
    line(
      `  ${row.order_id.padEnd(8)} #${String(row.id).padEnd(6)} ${ok ? 'CAGED  ' : 'skipped'} ` +
        `${isNew ? 'new     ' : 'existing'}  sku=${String(rec?.sku ?? '-').padEnd(12)} ` +
        `item=${String(rec?.itemNumber ?? '-').padEnd(12)} blocked=${blocked}`,
    );
    if (ok) caged += 1;
    else skipped += 1;
  }
  line(`\ncaged ${caged}, skipped ${skipped}`);
  line('Review them on the desk: /shipping/orders?cage=1');
  await pool.end();
}

main().catch((err) => {
  console.error('ecwid-intake-batch failed:', err);
  process.exit(1);
});
