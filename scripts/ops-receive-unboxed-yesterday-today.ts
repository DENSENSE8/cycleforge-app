/**
 * Batch: Zoho purchase-receive for dogfood issued POs with qty received and
 * no zoho_purchase_receive_id. Same path as Unbox Receive after()
 * (createPurchaseReceive + PO notes + mirror + stamp). Notes are Kai plus
 * scan/unbox instants from receiving_line / receiving_unbox — not "now".
 *
 * Usage:
 *   OPS_ENV_FILE=.env.vercel.prod.tmp node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/ops-receive-unboxed-yesterday-today.ts --issued-pending
 */
import { config } from 'dotenv';

function kmsKeyLooksValid(): boolean {
  const raw = process.env.INTEGRATION_KMS_KEY ?? '';
  if (!raw) return false;
  try {
    return Buffer.from(raw, 'base64').length === 32;
  } catch {
    return false;
  }
}

// `vercel env run -e production` already injects a real KMS key. Do not let
// dotenv/.env.local clobber it with a stub.
if (!kmsKeyLooksValid()) {
  config({ path: '.env' });
  config({ path: '.env.local' });
  if (process.env.OPS_ENV_FILE) {
    config({ path: process.env.OPS_ENV_FILE, override: true });
  }
}

import pool from '@/lib/db';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { withZohoOrg } from '@/lib/zoho/tenant-context';
import {
  getPurchaseOrderById,
  createPurchaseReceive,
  updatePurchaseOrder,
  assertPurchaseOrderReceivable,
  sumWarehouseReceivedByPoLineItem,
  catalogItemIdFromZohoPoLineItem,
  searchItemBySku,
  getPurchaseReceiveIdFromCreateResponse,
  listPurchaseReceives,
} from '@/lib/zoho';
import { syncOnePoMirror } from '@/lib/zoho/po-mirror-sync';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { upsertReceivingLineZoho } from '@/lib/receiving/facts/narrow';
import type { FactsDeps } from '@/lib/receiving/facts/store';
import { formatPSTTimestamp, toPSTDateKey } from '@/utils/date';
import { buildZohoReceiveNoteLine } from '@/lib/receiving/zoho-receive-note';

const ALREADY_RECEIVED_RE =
  /already\s+created\s+a\s+receive\s+for\s+all\s+the\s+items|already\s+(fully\s+)?received|marked\s+as\s+received/i;

const KAI_STAFF_ID = 7;
const KAI_STAFF_NAME = 'Kai';
const PO_GAP_MS = 2_500;
const FORCED_PO_NUMBERS = ['64414585', '64415105'];
const MICHAEL_NOTE_RE = /^(Michael(?:\s+Garisek)?|Staff\s*#\s*\d+)\b/i;
const STAFF_HASH_RE = /Staff\s*#\s*\d+/i;

type Row = {
  id: number;
  receiving_id: number;
  sku: string | null;
  quantity_received: number;
  workflow_status: string;
  zoho_purchaseorder_id: string;
  zoho_line_item_id: string | null;
  zoho_item_id: string | null;
  zoho_purchaseorder_number: string | null;
  scanned_at: Date | null;
  unboxed_at: Date | null;
  received_at: Date | null;
};

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function kaiPoNote(lines: Row[]): string {
  const scanned = lines.map((l) => l.scanned_at).filter((d): d is Date => d != null);
  const unboxed = lines.map((l) => l.unboxed_at).filter((d): d is Date => d != null);
  const earliest = (dates: Date[]) =>
    dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime())));
  return buildZohoReceiveNoteLine({
    staffName: KAI_STAFF_NAME,
    scannedAt: earliest(scanned),
    unboxedAt: earliest(unboxed),
  });
}

function receiveCivilDate(lines: Row[]): string | undefined {
  const unbox = lines.map((l) => l.unboxed_at).find(Boolean);
  const scan = lines.map((l) => l.scanned_at).find(Boolean);
  const received = lines.map((l) => l.received_at).find(Boolean);
  const key = toPSTDateKey(unbox ?? scan ?? received ?? null);
  return key || undefined;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function loadIssuedPending(): Promise<Row[]> {
  const res = await pool.query<Row>(
    `SELECT rl.id,
            rl.receiving_id,
            rl.sku,
            rl.quantity_received,
            rl.workflow_status::text AS workflow_status,
            rz.zoho_purchaseorder_id,
            rz.zoho_line_item_id,
            rz.zoho_item_id,
            COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number) AS zoho_purchaseorder_number,
            rl.scanned_at,
            ru.unboxed_at,
            rl.received_at
       FROM receiving_line rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
       LEFT JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
        AND m.organization_id = rl.organization_id
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = rl.receiving_id
        AND ru.organization_id = rl.organization_id
      WHERE rl.organization_id = $1
        AND COALESCE(rl.quantity_received, 0) > 0
        AND rz.zoho_purchaseorder_id IS NOT NULL
        AND (
          (
            rz.zoho_purchase_receive_id IS NULL
            AND lower(COALESCE(m.status, '')) = 'issued'
          )
          OR COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number) = ANY($2::text[])
        )
      ORDER BY rz.zoho_purchaseorder_id, rl.id`,
    [DOGFOOD_ORG_ID, FORCED_PO_NUMBERS],
  );
  return res.rows.map((r) => ({
    ...r,
    scanned_at: asDate(r.scanned_at),
    unboxed_at: asDate(r.unboxed_at),
    received_at: asDate(r.received_at),
  }));
}

async function loadYesterdayTargets(): Promise<Row[]> {
  const res = await pool.query<Row>(
    `SELECT rl.id,
            rl.receiving_id,
            rl.sku,
            rl.quantity_received,
            rl.workflow_status::text AS workflow_status,
            rz.zoho_purchaseorder_id,
            rz.zoho_line_item_id,
            rz.zoho_item_id,
            COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number) AS zoho_purchaseorder_number,
            rl.scanned_at,
            ru.unboxed_at,
            rl.received_at
       FROM receiving_line rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
       LEFT JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
        AND m.organization_id = rl.organization_id
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = rl.receiving_id
        AND ru.organization_id = rl.organization_id
      WHERE rl.organization_id = $1
        AND COALESCE(rl.quantity_received, 0) > 0
        AND rz.zoho_purchaseorder_id IS NOT NULL
        AND rz.zoho_purchase_receive_id IS NULL
        AND rl.received_at >= ((CURRENT_DATE AT TIME ZONE 'America/Los_Angeles') - INTERVAL '1 day')
        AND rl.received_at < (CURRENT_DATE AT TIME ZONE 'America/Los_Angeles')
      ORDER BY rz.zoho_purchaseorder_id, rl.id`,
    [DOGFOOD_ORG_ID],
  );
  return res.rows.map((r) => ({
    ...r,
    scanned_at: asDate(r.scanned_at),
    unboxed_at: asDate(r.unboxed_at),
    received_at: asDate(r.received_at),
  }));
}

async function latestReceiveIdForPo(poId: string): Promise<string | null> {
  try {
    const recs = await listPurchaseReceives({ purchaseorder_id: poId, per_page: 25 });
    const rows = recs.purchasereceives || [];
    const last = rows[rows.length - 1] as unknown as Record<string, unknown> | undefined;
    const raw = last?.purchase_receive_id ?? last?.receive_id;
    const s = raw != null ? String(raw).trim() : '';
    return s || null;
  } catch {
    return null;
  }
}

async function receivePoInZoho(
  poId: string,
  lines: Row[],
): Promise<{ outcome: 'received' | 'already' | 'nothing' | 'terminal'; receiveId: string | null }> {
  const detail = await getPurchaseOrderById(poId);
  const po = detail.purchaseorder;
  const status = String(po?.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  console.log(`  Zoho status=${status || '—'} number=${po?.purchaseorder_number ?? '—'}`);

  if (status === 'received' || status === 'billed' || status === 'closed') {
    return { outcome: 'terminal', receiveId: await latestReceiveIdForPo(poId) };
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

  if (lineItems.length === 0) {
    return { outcome: 'already', receiveId: await latestReceiveIdForPo(poId) };
  }
  try {
    const date = receiveCivilDate(lines);
    const resp = await createPurchaseReceive({
      purchaseOrderId: poId,
      lineItems,
      bills: po?.bills,
      ...(date ? { date } : {}),
    });
    return { outcome: 'received', receiveId: getPurchaseReceiveIdFromCreateResponse(resp) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (ALREADY_RECEIVED_RE.test(msg)) {
      return { outcome: 'already', receiveId: await latestReceiveIdForPo(poId) };
    }
    throw err;
  }
}

function rewriteZohoNotesToKai(currentNotes: string, kaiLine: string): string | null {
  const raw = String(currentNotes || '');
  if (!raw.trim()) return kaiLine;
  const lines = raw.split('\n');
  let replaced = false;
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (MICHAEL_NOTE_RE.test(trimmed) || STAFF_HASH_RE.test(trimmed)) {
      replaced = true;
      return kaiLine;
    }
    return line;
  });
  if (replaced) return next.join('\n');
  if (raw.includes(kaiLine)) return null;
  return `${kaiLine}\n${raw}`;
}

async function writeKaiNotes(poId: string, lines: Row[]): Promise<string> {
  const existing = await getPurchaseOrderById(poId);
  const poHeader = (existing?.purchaseorder || {}) as Record<string, unknown>;
  const currentNotes = String(poHeader.notes || '');
  const newLine = kaiPoNote(lines);
  const next = rewriteZohoNotesToKai(currentNotes, newLine);
  if (next == null) {
    console.log(`  notes: already ${newLine}`);
    return newLine;
  }
  await updatePurchaseOrder(poId, { notes: next });
  console.log(`  notes: ${newLine}`);
  return newLine;
}

async function loadYesterdayPdtRows(): Promise<Row[]> {
  const res = await pool.query<Row>(
    `SELECT rl.id,
            rl.receiving_id,
            rl.sku,
            rl.quantity_received,
            rl.workflow_status::text AS workflow_status,
            rz.zoho_purchaseorder_id,
            rz.zoho_line_item_id,
            rz.zoho_item_id,
            COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number) AS zoho_purchaseorder_number,
            rl.scanned_at,
            ru.unboxed_at,
            rl.received_at
       FROM receiving_line rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
       LEFT JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
        AND m.organization_id = rl.organization_id
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = rl.receiving_id
        AND ru.organization_id = rl.organization_id
      WHERE rl.organization_id = $1
        AND COALESCE(rl.quantity_received, 0) > 0
        AND rz.zoho_purchaseorder_id IS NOT NULL
        AND (timezone('America/Los_Angeles', COALESCE(ru.unboxed_at, rl.received_at, rl.scanned_at)))::date
            = DATE '2026-08-17'
      ORDER BY rz.zoho_purchaseorder_id, rl.id`,
    [DOGFOOD_ORG_ID],
  );
  return res.rows.map((r) => ({
    ...r,
    scanned_at: asDate(r.scanned_at),
    unboxed_at: asDate(r.unboxed_at),
    received_at: asDate(r.received_at),
  }));
}

async function stampReceiveIds(lines: Row[], receiveId: string | null): Promise<void> {
  if (!receiveId) return;
  const linkedAt = formatPSTTimestamp();
  await withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    const cartonIds = [...new Set(lines.map((l) => l.receiving_id))];
    await client.query(
      `UPDATE receiving_carton
          SET zoho_purchase_receive_id = COALESCE(zoho_purchase_receive_id, $1),
              updated_at = NOW()
        WHERE organization_id = $2 AND id = ANY($3::int[])`,
      [receiveId, DOGFOOD_ORG_ID, cartonIds],
    );
    const txDeps: FactsDeps = {
      query: ((_org, sql, p) => client.query(sql, p as unknown[])) as FactsDeps['query'],
    };
    for (const line of lines) {
      await upsertReceivingLineZoho(
        DOGFOOD_ORG_ID,
        line.id,
        { zohoPurchaseReceiveId: receiveId, zohoSyncedAt: linkedAt },
        txDeps,
      );
    }
  });
}

async function promoteLinesDone(lines: Row[]): Promise<number> {
  return withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    let n = 0;
    for (const line of lines) {
      if (line.workflow_status === 'DONE') continue;
      const tr = await transitionReceivingLine(
        { receivingLineId: line.id, to: 'DONE', actorStaffId: KAI_STAFF_ID, skipEvent: true },
        client,
        DOGFOOD_ORG_ID,
      );
      if (tr.ok && tr.changed) n += 1;
      else if (!tr.ok) console.warn(`  line ${line.id} DONE: ${tr.status} ${tr.error}`);
    }
    return n;
  });
}

async function rewindLinesUnboxed(lines: Row[]): Promise<number> {
  return withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    let n = 0;
    for (const line of lines) {
      if (line.workflow_status === 'UNBOXED') continue;
      const tr = await transitionReceivingLine(
        { receivingLineId: line.id, to: 'UNBOXED', actorStaffId: KAI_STAFF_ID, skipEvent: true },
        client,
        DOGFOOD_ORG_ID,
      );
      if (tr.ok && tr.changed) n += 1;
      else if (!tr.ok) console.warn(`  line ${line.id} UNBOXED: ${tr.status} ${tr.error}`);
    }
    return n;
  });
}

async function rewindIssuedDoneToUnboxed(): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `SELECT rl.id
       FROM receiving_line rl
       JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
       JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
        AND m.organization_id = rl.organization_id
      WHERE rl.organization_id = $1
        AND rl.workflow_status = 'DONE'
        AND lower(m.status) = 'issued'
      ORDER BY rl.id`,
    [DOGFOOD_ORG_ID],
  );
  console.log(`issued+DONE to rewind: ${res.rows.length} line(s)`);
  if (res.rows.length === 0) return 0;
  return rewindLinesUnboxed(
    res.rows.map((r) => ({
      id: r.id,
      receiving_id: 0,
      sku: null,
      quantity_received: 0,
      workflow_status: 'DONE',
      zoho_purchaseorder_id: '',
      zoho_line_item_id: null,
      zoho_item_id: null,
      zoho_purchaseorder_number: null,
      scanned_at: null,
      unboxed_at: null,
      received_at: null,
    })),
  );
}

async function main() {
  const rewindOnly = process.argv.includes('--rewind-issued-only');
  if (rewindOnly) {
    console.log('ops-receive — rewind Zoho-issued DONE → UNBOXED (inventory SoT)\n');
    const n = await rewindIssuedDoneToUnboxed();
    console.log(`rewound: ${n}`);
    return;
  }

  const issuedPending = process.argv.includes('--issued-pending') || !process.argv.includes('--yesterday-only');
  console.log(
    issuedPending
      ? 'ops-receive — Zoho receive for issued POs with qty and no purchase receive id\n'
      : 'ops-receive-unboxed-yesterday-today — Zoho receive for yesterday PDT (no purchase receive id)\n',
  );
  const rows = issuedPending ? await loadIssuedPending() : await loadYesterdayTargets();
  console.log(`targets: ${rows.length} line(s)\n`);
  if (rows.length === 0) return;

  const byPo = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byPo.get(r.zoho_purchaseorder_id) ?? [];
    list.push(r);
    byPo.set(r.zoho_purchaseorder_id, list);
  }

  await withZohoOrg(DOGFOOD_ORG_ID, async () => {
    let i = 0;
    for (const [poId, lines] of byPo) {
      if (i > 0) await sleep(PO_GAP_MS);
      i += 1;
      const label = lines[0]?.zoho_purchaseorder_number || poId;
      console.log(`── ${label} (zoho ${poId}, ${lines.length} line(s))`);
      let notesLine = '';
      let receiveState = 'failed';
      try {
        const { outcome, receiveId } = await receivePoInZoho(poId, lines);
        console.log(`  Zoho receive: ${outcome}${receiveId ? ` id=${receiveId}` : ''}`);

        const zohoOk = outcome === 'received' || outcome === 'already' || outcome === 'terminal';
        receiveState = zohoOk ? outcome : 'failed';
        if (zohoOk) {
          try {
            notesLine = await writeKaiNotes(poId, lines);
          } catch (err) {
            console.warn(`  notes skip:`, err instanceof Error ? err.message : err);
          }
        }

        try {
          const mirror = await syncOnePoMirror(poId, DOGFOOD_ORG_ID);
          console.log(`  mirror: found=${mirror.found} status=${mirror.status}`);
        } catch (err) {
          console.warn(
            `  mirror skip:`,
            err instanceof Error ? err.message : err,
          );
        }

        if (zohoOk) {
          await stampReceiveIds(lines, receiveId);
          const promoted = await promoteLinesDone(lines);
          console.log(`  local DONE: ${promoted}/${lines.length} newly promoted`);
        } else {
          const rewound = await rewindLinesUnboxed(lines);
          console.log(`  rewind UNBOXED: ${rewound}/${lines.length}`);
        }
      } catch (err) {
        console.error(
          `  FAILED:`,
          err instanceof Error ? `${err.name}: ${err.message}` : err,
        );
        const rewound = await rewindLinesUnboxed(lines);
        console.log(`  rewind UNBOXED: ${rewound}/${lines.length} (website must not show Received)`);
      }
      console.log(`RESULT\t${label}\t${receiveState}\t${notesLine || '—'}`);
      console.log('');
    }

    const yesterday = await loadYesterdayPdtRows();
    const byYesterdayPo = new Map<string, Row[]>();
    for (const r of yesterday) {
      const list = byYesterdayPo.get(r.zoho_purchaseorder_id) ?? [];
      list.push(r);
      byYesterdayPo.set(r.zoho_purchaseorder_id, list);
    }
    console.log(`yesterday PDT note rewrite: ${byYesterdayPo.size} PO(s)\n`);
    for (const [poId, yLines] of byYesterdayPo) {
      if (byPo.has(poId)) continue;
      const label = yLines[0]?.zoho_purchaseorder_number || poId;
      try {
        const existing = await getPurchaseOrderById(poId);
        const currentNotes = String(
          ((existing?.purchaseorder || {}) as Record<string, unknown>).notes || '',
        );
        const first = currentNotes.split('\n')[0] ?? '';
        const mentionsMichael = MICHAEL_NOTE_RE.test(first.trim()) || STAFF_HASH_RE.test(currentNotes);
        if (!mentionsMichael) {
          console.log(`── ${label}: no Michael/Staff # in Zoho notes — skip`);
          continue;
        }
        const notesLine = await writeKaiNotes(poId, yLines);
        console.log(`RESULT\t${label}\tnotes-rewritten\t${notesLine}`);
      } catch (err) {
        console.warn(`── ${label}: note rewrite failed:`, err instanceof Error ? err.message : err);
        console.log(`RESULT\t${label}\tnotes-failed\t—`);
      }
      await sleep(PO_GAP_MS);
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
