/**
 * Batch: Zoho purchase-receive + UNBOXED→DONE for dogfood lines updated
 * yesterday or today (America/Los_Angeles) that still have qty received.
 *
 * Usage:
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/ops-receive-unboxed-yesterday-today.ts
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

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

const ALREADY_RECEIVED_RE =
  /already\s+created\s+a\s+receive\s+for\s+all\s+the\s+items|already\s+(fully\s+)?received|marked\s+as\s+received/i;

type Row = {
  id: number;
  receiving_id: number;
  sku: string | null;
  quantity_received: number;
  zoho_purchaseorder_id: string;
  zoho_line_item_id: string | null;
  zoho_item_id: string | null;
  zoho_purchaseorder_number: string | null;
};

async function loadTargets(): Promise<Row[]> {
  const res = await pool.query<Row>(
    `SELECT rl.id,
            rl.receiving_id,
            rl.sku,
            rl.quantity_received,
            rz.zoho_purchaseorder_id,
            rz.zoho_line_item_id,
            rz.zoho_item_id,
            m.zoho_purchaseorder_number
       FROM receiving_lines rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
       LEFT JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
        AND m.organization_id = rl.organization_id
      WHERE rl.organization_id = $1
        AND rl.workflow_status = 'UNBOXED'
        AND COALESCE(rl.quantity_received, 0) > 0
        AND rz.zoho_purchaseorder_id IS NOT NULL
        AND rl.updated_at >= ((CURRENT_DATE AT TIME ZONE 'America/Los_Angeles') - INTERVAL '1 day')
      ORDER BY rz.zoho_purchaseorder_id, rl.id`,
    [DOGFOOD_ORG_ID],
  );
  return res.rows;
}

async function receivePoInZoho(
  poId: string,
  lines: Row[],
): Promise<'received' | 'already' | 'nothing' | 'terminal'> {
  const detail = await getPurchaseOrderById(poId);
  const po = detail.purchaseorder;
  const status = String(po?.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  console.log(`  Zoho status=${status || '—'} number=${po?.purchaseorder_number ?? '—'}`);

  if (status === 'received' || status === 'billed' || status === 'closed') {
    return 'terminal';
  }

  assertPurchaseOrderReceivable(detail);
  const receivedTotals = await sumWarehouseReceivedByPoLineItem(poId);
  const poLines = Array.isArray(po?.line_items) ? po!.line_items! : [];

  const want = new Map<string, Row>();
  for (const l of lines) {
    const li = String(l.zoho_line_item_id || '').trim();
    if (li) want.set(li, l);
  }

  const lineItems: { line_item_id: string; quantity_received: number; item_id: string }[] = [];
  for (const raw of poLines) {
    const li = raw as unknown as Record<string, unknown>;
    const id = String(li.line_item_id ?? li.id ?? '').trim();
    if (!id || !want.has(id)) continue;
    const ordered = Number(li.quantity ?? 0);
    if (!Number.isFinite(ordered) || ordered <= 0) continue;
    const pending = Math.max(0, Math.floor(ordered - (receivedTotals.get(id) ?? 0) + 1e-9));
    if (pending <= 0) continue;
    let itemId = catalogItemIdFromZohoPoLineItem(raw) || String(want.get(id)?.zoho_item_id || '').trim();
    if (!itemId) {
      const sku = String(want.get(id)?.sku || li.sku || '').trim();
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
    const msg = err instanceof Error ? err.message : String(err);
    if (ALREADY_RECEIVED_RE.test(msg)) return 'already';
    throw err;
  }
}

async function promoteLinesDone(lineIds: number[]): Promise<number> {
  return withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    let n = 0;
    for (const id of lineIds) {
      const tr = await transitionReceivingLine(
        {
          receivingLineId: id,
          to: 'DONE',
          expectedFrom: 'UNBOXED',
          skipEvent: true,
        },
        client,
        DOGFOOD_ORG_ID,
      );
      if (tr.ok && tr.changed) n += 1;
      else if (!tr.ok) console.warn(`  line ${id} DONE: ${tr.status} ${tr.error}`);
    }
    return n;
  });
}

async function main() {
  console.log('ops-receive-unboxed-yesterday-today — Zoho receive + local UNBOXED→DONE\n');
  const rows = await loadTargets();
  console.log(`targets: ${rows.length} line(s)\n`);
  if (rows.length === 0) return;

  const byPo = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byPo.get(r.zoho_purchaseorder_id) ?? [];
    list.push(r);
    byPo.set(r.zoho_purchaseorder_id, list);
  }

  await withZohoOrg(DOGFOOD_ORG_ID, async () => {
    for (const [poId, lines] of byPo) {
      const label = lines[0]?.zoho_purchaseorder_number || poId;
      console.log(`── ${label} (zoho ${poId}, ${lines.length} line(s))`);
      try {
        const outcome = await receivePoInZoho(poId, lines);
        console.log(`  Zoho receive: ${outcome}`);

        try {
          const mirror = await syncOnePoMirror(poId, DOGFOOD_ORG_ID);
          console.log(`  mirror: found=${mirror.found} status=${mirror.status}`);
        } catch (err) {
          console.warn(
            `  mirror skip:`,
            err instanceof Error ? err.message : err,
          );
        }

        const promoted = await promoteLinesDone(lines.map((l) => l.id));
        console.log(`  local DONE: ${promoted}/${lines.length}`);
      } catch (err) {
        console.error(
          `  FAILED:`,
          err instanceof Error ? `${err.name}: ${err.message}` : err,
        );
        // Still try local DONE when Zoho is ahead / unreachable but line is
        // physically received — operator asked for local tables clean too.
        // Only promote when Zoho said already/terminal; hard failures leave UNBOXED.
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
