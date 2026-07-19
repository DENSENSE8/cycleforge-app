/**
 * One-shot: resolve dogfood PO numbers → Zoho purchase-receive + promote
 * receiving_line rows to DONE via transitionReceivingLine.
 *
 * Usage: npx tsx scripts/ops-mark-pos-received.ts
 */
import pool from '@/lib/db';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { withZohoOrg } from '@/lib/zoho/tenant-context';
import {
  getPurchaseOrderById,
  createPurchaseReceive,
  assertPurchaseOrderReceivable,
  sumWarehouseReceivedByPoLineItem,
  catalogItemIdFromZohoPoLineItem,
  searchItemBySku,
} from '@/lib/zoho';
import { syncOnePoMirror } from '@/lib/zoho/po-mirror-sync';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { withTenantTransaction } from '@/lib/tenancy/db';

const ALREADY_RECEIVED_RE = /already\s+created\s+a\s+receive\s+for\s+all\s+the\s+items/i;

const TARGET_NUMBERS = [
  '63807788',
  '63859929',
  '63805388',
  '06-14898-93808',
  '63859973',
  '05-14909-79883',
  '02-14876-13796',
] as const;

type ResolvedPo = {
  number: string;
  zohoPoId: string | null;
  lineIds: number[];
  statuses: Record<string, number>;
};

async function resolvePo(number: string): Promise<ResolvedPo | null> {
  return withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    const res = await client.query<{
      id: number;
      workflow_status: string;
      zoho_purchaseorder_id: string | null;
    }>(
      `SELECT rl.id,
              rl.workflow_status::text AS workflow_status,
              NULLIF(TRIM(rlz.zoho_purchaseorder_id), '') AS zoho_purchaseorder_id
         FROM receiving_line rl
         LEFT JOIN receiving_line_zoho rlz
           ON rlz.receiving_line_id = rl.id
          AND rlz.organization_id = rl.organization_id
        WHERE rl.organization_id = $1
          AND (
            NULLIF(TRIM(rlz.zoho_purchaseorder_number), '') = $2
            OR NULLIF(TRIM(rlz.zoho_purchaseorder_number_norm), '') = $2
          )
        ORDER BY rl.id`,
      [DOGFOOD_ORG_ID, number],
    );
    if (res.rows.length === 0) {
      // Fallback: mirror by PO number only (no lines yet).
      const mirror = await client.query<{ zoho_purchaseorder_id: string }>(
        `SELECT NULLIF(TRIM(purchaseorder_id), '') AS zoho_purchaseorder_id
           FROM zoho_po_mirror
          WHERE organization_id = $1
            AND (
              NULLIF(TRIM(purchaseorder_number), '') = $2
              OR NULLIF(TRIM(purchaseorder_id), '') = $2
            )
          LIMIT 1`,
        [DOGFOOD_ORG_ID, number],
      );
      if (mirror.rows[0]?.zoho_purchaseorder_id) {
        return {
          number,
          zohoPoId: mirror.rows[0].zoho_purchaseorder_id,
          lineIds: [],
          statuses: {},
        };
      }
      return null;
    }
    const statuses: Record<string, number> = {};
    const lineIds: number[] = [];
    let zohoPoId: string | null = null;
    for (const row of res.rows) {
      lineIds.push(row.id);
      statuses[row.workflow_status] = (statuses[row.workflow_status] ?? 0) + 1;
      if (!zohoPoId && row.zoho_purchaseorder_id) zohoPoId = row.zoho_purchaseorder_id;
    }
    return { number, zohoPoId, lineIds, statuses };
  });
}

async function receivePoInZoho(poId: string): Promise<'received' | 'already' | 'nothing'> {
  const detail = await getPurchaseOrderById(poId);
  assertPurchaseOrderReceivable(detail);
  const po = detail.purchaseorder;
  const lines = Array.isArray(po?.line_items) ? po!.line_items! : [];
  const receivedTotals = await sumWarehouseReceivedByPoLineItem(poId);

  const lineItems: { line_item_id: string; quantity_received: number; item_id: string }[] = [];
  for (const raw of lines) {
    const li = raw as unknown as Record<string, unknown>;
    const id = String(li.line_item_id ?? li.id ?? '').trim();
    if (!id) continue;
    const ordered = Number(li.quantity ?? 0);
    if (!Number.isFinite(ordered) || ordered <= 0) continue;
    const pending = Math.max(0, Math.floor(ordered - (receivedTotals.get(id) ?? 0) + 1e-9));
    if (pending <= 0) continue;
    let itemId = catalogItemIdFromZohoPoLineItem(raw) || '';
    if (!itemId) {
      const sku = String(li.sku ?? '').trim();
      if (sku) {
        try {
          itemId = String((await searchItemBySku(sku))?.item_id || '').trim();
        } catch {
          itemId = '';
        }
      }
    }
    if (!itemId) {
      console.warn(`  skip Zoho line ${id}: no catalog item_id`);
      continue;
    }
    lineItems.push({ line_item_id: id, quantity_received: pending, item_id: itemId });
  }

  if (lineItems.length === 0) return 'already';
  try {
    await createPurchaseReceive({ purchaseOrderId: poId, lineItems, bills: po?.bills });
    return 'received';
  } catch (err) {
    if (ALREADY_RECEIVED_RE.test(err instanceof Error ? err.message : String(err))) return 'already';
    throw err;
  }
}

/** Promote any non-DONE line for this PO number to DONE (permissive edges). */
async function promoteLinesDone(lineIds: number[]): Promise<{ ok: number; skipped: number }> {
  if (lineIds.length === 0) return { ok: 0, skipped: 0 };
  return withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    const res = await client.query<{ id: number; workflow_status: string }>(
      `SELECT id, workflow_status::text AS workflow_status
         FROM receiving_line
        WHERE organization_id = $1
          AND id = ANY($2::int[])
          AND workflow_status::text <> 'DONE'`,
      [DOGFOOD_ORG_ID, lineIds],
    );
    let ok = 0;
    let skipped = 0;
    for (const row of res.rows) {
      const tr = await transitionReceivingLine(
        {
          receivingLineId: row.id,
          to: 'DONE',
          expectedFrom: row.workflow_status as 'UNBOXED',
          skipEvent: true,
        },
        client,
        DOGFOOD_ORG_ID,
      );
      if (tr.ok) ok += 1;
      else {
        skipped += 1;
        console.warn(`  line ${row.id} (${row.workflow_status}→DONE): ${tr.status} ${tr.error}`);
      }
    }
    return { ok, skipped };
  });
}

async function main() {
  console.log('ops-mark-pos-received — Zoho receive + local → DONE\n');
  console.log(`targets: ${TARGET_NUMBERS.join(', ')}\n`);

  await withZohoOrg(DOGFOOD_ORG_ID, async () => {
    for (const number of TARGET_NUMBERS) {
      console.log(`── ${number}`);
      try {
        const resolved = await resolvePo(number);
        if (!resolved) {
          console.error('  NOT FOUND in receiving_line / zoho_po_mirror');
          console.log('');
          continue;
        }
        console.log(
          `  lines=${resolved.lineIds.length} statuses=${JSON.stringify(resolved.statuses)} zohoPoId=${resolved.zohoPoId ?? '—'}`,
        );

        if (resolved.zohoPoId) {
          try {
            const before = await getPurchaseOrderById(resolved.zohoPoId);
            console.log(`  Zoho before: status=${before.purchaseorder?.status}`);
            const outcome = await receivePoInZoho(resolved.zohoPoId);
            console.log(`  Zoho receive: ${outcome}`);
            const mirror = await syncOnePoMirror(resolved.zohoPoId, DOGFOOD_ORG_ID);
            console.log(`  mirror: found=${mirror.found} status=${mirror.status}`);
          } catch (err) {
            console.warn(
              `  Zoho step skipped/failed:`,
              err instanceof Error ? `${err.name}: ${err.message}` : err,
            );
          }
        } else {
          console.log('  no Zoho PO id — local DONE only');
        }

        const promoted = await promoteLinesDone(resolved.lineIds);
        console.log(`  local DONE: ${promoted.ok} ok, ${promoted.skipped} skipped`);

        const after = await resolvePo(number);
        if (after) {
          console.log(`  after statuses=${JSON.stringify(after.statuses)}`);
        }
      } catch (err) {
        console.error(
          `  FAILED:`,
          err instanceof Error ? `${err.name}: ${err.message}` : err,
        );
      }
      console.log('');
    }
  });
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
