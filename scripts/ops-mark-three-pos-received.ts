/**
 * One-shot: Zoho purchase-receive + UNBOXED→DONE for three dogfood POs that
 * already saved locally but failed background Zoho sync (rate limit).
 *
 * Usage: npx tsx scripts/ops-mark-three-pos-received.ts
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

const TARGETS = [
  { number: '13-14846-06962', zohoPoId: '5623409000002994216', cartonId: 7284 },
  { number: '02-14876-13796', zohoPoId: '5623409000003088081', cartonId: 14594 },
  { number: '05-14909-79883', zohoPoId: '5623409000003090148', cartonId: 18534 },
] as const;

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
      console.warn(`  skip line ${id}: no catalog item_id`);
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

async function promoteLinesDone(cartonId: number): Promise<number> {
  const lines = await withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    const res = await client.query<{ id: number; workflow_status: string }>(
      `SELECT id, workflow_status::text AS workflow_status
         FROM receiving_line
        WHERE organization_id = $1
          AND receiving_id = $2
          AND workflow_status = 'UNBOXED'`,
      [DOGFOOD_ORG_ID, cartonId],
    );
    let n = 0;
    for (const row of res.rows) {
      const tr = await transitionReceivingLine(
        {
          receivingLineId: row.id,
          to: 'DONE',
          expectedFrom: 'UNBOXED',
          skipEvent: true,
        },
        client,
        DOGFOOD_ORG_ID,
      );
      if (tr.ok) n += 1;
      else console.warn(`  line ${row.id} DONE transition: ${tr.status} ${tr.error}`);
    }
    return n;
  });
  return lines;
}

async function main() {
  console.log('ops-mark-three-pos-received — Zoho receive + local UNBOXED→DONE\n');

  await withZohoOrg(DOGFOOD_ORG_ID, async () => {
    for (const t of TARGETS) {
      console.log(`── ${t.number} (zoho ${t.zohoPoId}, carton ${t.cartonId})`);
      try {
        const before = await getPurchaseOrderById(t.zohoPoId);
        console.log(`  Zoho before: status=${before.purchaseorder?.status}`);

        const outcome = await receivePoInZoho(t.zohoPoId);
        console.log(`  Zoho receive: ${outcome}`);

        const mirror = await syncOnePoMirror(t.zohoPoId, DOGFOOD_ORG_ID);
        console.log(`  mirror: found=${mirror.found} status=${mirror.status}`);

        const promoted = await promoteLinesDone(t.cartonId);
        console.log(`  local DONE: ${promoted} line(s)`);
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
