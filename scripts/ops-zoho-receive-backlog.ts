/**
 * Backfill executor: for dogfood POs that are received locally (qty > 0,
 * Zoho-linked) but never propagated (no zoho_purchase_receive_id AND mirror
 * status is 'issued' or the mirror row is missing), do the FULL Unbox Receive
 * after() push:
 *
 *   1. createPurchaseReceive for pending quantities (idempotent; terminal
 *      statuses short-circuit to the latest existing receive id)
 *   2. unit notes — per-line serial/condition description merged into the Zoho
 *      PO line items (rz.zoho_notes is the local SoT snippet, serial_units
 *      provenance is the fallback)
 *   3. PO header notes — `Kai · scanned … · unboxed …` line, rewriting any
 *      Michael/Staff #N lead (same contract as ops-receive-unboxed-yesterday)
 *   4. syncOnePoMirror + stamp zoho_purchase_receive_id + local DONE promotion
 *
 * Zoho API budget: ~6 calls per PO, PO_GAP_MS pacing. The 5k/day plan cap that
 * blocked the original propagation is not a constraint at this batch size.
 *
 * Usage:
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/ops-zoho-receive-backlog.ts [--dry-run]
 *
 * --dry-run is GET-only: resolves every target, reads each PO's live status,
 * and prints the intended receive lines, notes diff, and description PUTs
 * without writing anything.
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
  assertPurchaseOrderLineItemsEditable,
  sumWarehouseReceivedByPoLineItem,
  catalogItemIdFromZohoPoLineItem,
  searchItemBySku,
  getPurchaseReceiveIdFromCreateResponse,
  listPurchaseReceives,
  buildPurchaseOrderLineItemsForDescriptionPut,
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
  zoho_notes: string | null;
  scanned_at: Date | null;
  unboxed_at: Date | null;
  received_at: Date | null;
  serials: string[];
};

type ReceiveLine = { line_item_id: string; quantity_received: number; item_id: string };

/** GET-only receive plan for one PO. */
type ReceivePlan = {
  decision: 'receive' | 'terminal' | 'nothing-pending';
  liveStatus: string;
  liveNumber: string | null;
  /** Intended purchase-receive lines (decision === 'receive' only). */
  lineItems: ReceiveLine[];
  /** Latest existing receive id (decision === 'terminal'). */
  existingReceiveId: string | null;
  /** Set when a local line matched no live Zoho line item — surfaced, not thrown. */
  unmatchedLocalLines: number[];
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
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * Targets: locally-received, Zoho-linked lines with NO purchase receive id
 * whose PO mirror is 'issued' or absent. mirror='received' POs are already
 * propagated in Zoho — excluded (their missing stamp is a pre-existing
 * historical artifact, not a Zoho gap).
 */
async function loadBacklog(): Promise<Row[]> {
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
            rz.zoho_notes,
            rl.scanned_at,
            ru.unboxed_at,
            rl.received_at,
            COALESCE(
              (SELECT array_agg(su.serial_number ORDER BY su.created_at, su.id)
                 FROM serial_units su
                 JOIN serial_unit_provenance sp
                   ON sp.serial_unit_id = su.id
                  AND sp.origin_type = 'RECEIVING_LINE'
                  AND sp.origin_id = rl.id
                  AND sp.organization_id = rl.organization_id
                WHERE su.organization_id = rl.organization_id),
              '{}'
            ) AS serials
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
        AND COALESCE(lower(m.status), 'issued') = 'issued'
      ORDER BY rz.zoho_purchaseorder_id, rl.id`,
    [DOGFOOD_ORG_ID],
  );
  return res.rows.map((r) => ({
    ...r,
    scanned_at: asDate(r.scanned_at),
    unboxed_at: asDate(r.unboxed_at),
    received_at: asDate(r.received_at),
    serials: (r.serials ?? []).filter(Boolean),
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

/**
 * GET-only: decide what this PO needs. Never POSTs. `want` maps live Zoho
 * line_item_id → local row; a local line whose zoho_line_item_id is absent from
 * the live PO is reported via unmatchedLocalLines instead of silently dropped.
 */
async function planReceive(poId: string, lines: Row[]): Promise<ReceivePlan> {
  const detail = await getPurchaseOrderById(poId);
  const po = detail.purchaseorder;
  const liveStatus = String(po?.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const liveNumber = po?.purchaseorder_number ?? null;

  if (liveStatus === 'received' || liveStatus === 'billed' || liveStatus === 'closed') {
    return {
      decision: 'terminal',
      liveStatus,
      liveNumber,
      lineItems: [],
      existingReceiveId: await latestReceiveIdForPo(poId),
      unmatchedLocalLines: [],
    };
  }

  assertPurchaseOrderReceivable(detail);
  const receivedTotals = await sumWarehouseReceivedByPoLineItem(poId);
  const poLines = Array.isArray(po?.line_items) ? po!.line_items! : [];

  const want = new Map<string, Row>();
  for (const l of lines) {
    const li = String(l.zoho_line_item_id || '').trim();
    if (li) want.set(li, l);
  }
  const matchedLineIds = new Set<string>();

  const lineItems: ReceiveLine[] = [];
  for (const raw of poLines) {
    const li = raw as unknown as Record<string, unknown>;
    const id = String(li.line_item_id ?? li.id ?? '').trim();
    if (!id || !want.has(id)) continue;
    matchedLineIds.add(id);
    const ordered = Number(li.quantity ?? 0);
    if (!Number.isFinite(ordered) || ordered <= 0) continue;
    const pending = Math.max(0, Math.floor(ordered - (receivedTotals.get(id) ?? 0) + 1e-9));
    if (pending <= 0) continue;
    let itemId =
      catalogItemIdFromZohoPoLineItem(raw) || String(want.get(id)?.zoho_item_id || '').trim();
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

  const unmatchedLocalLines = lines
    .filter((l) => {
      const li = String(l.zoho_line_item_id || '').trim();
      return li && !matchedLineIds.has(li);
    })
    .map((l) => l.id);

  return {
    decision: lineItems.length > 0 ? 'receive' : 'nothing-pending',
    liveStatus,
    liveNumber,
    lineItems,
    existingReceiveId: null,
    unmatchedLocalLines,
  };
}

/** POST the planned purchase receive. Call only with decision === 'receive'. */
async function executeReceive(
  poId: string,
  lines: Row[],
  plan: ReceivePlan,
): Promise<{ outcome: 'received' | 'already' | 'terminal'; receiveId: string | null }> {
  const date = receiveCivilDate(lines);
  const bills = (await getPurchaseOrderById(poId)).purchaseorder?.bills;
  try {
    const resp = await createPurchaseReceive({
      purchaseOrderId: poId,
      lineItems: plan.lineItems,
      bills,
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

/** Unit-notes serial map: rz.zoho_notes snippet first (local SoT), serial_units fallback. */
function unitNotesByLineItemId(lines: Row[]): Record<string, string> {
  const rec: Record<string, string> = {};
  for (const l of lines) {
    const liId = String(l.zoho_line_item_id || '').trim();
    if (!liId) continue;
    const snippet = String(l.zoho_notes || '').trim();
    if (snippet) {
      rec[liId] = snippet;
      continue;
    }
    if (l.serials.length > 0) {
      rec[liId] =
        l.serials.length === 1 ? `SN: ${l.serials[0]}` : `SNs: ${l.serials.join(', ')}`;
    }
  }
  return rec;
}

function rewriteHeaderNotes(currentNotes: string, kaiLine: string): string | null {
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

/**
 * One PUT for header notes + unit-note line descriptions. line_items only when
 * the PO is still line-editable (received/billed POs reject line edits — notes
 * alone still go through). When dryRun, print the diff and skip the PUT.
 */
async function patchPoNotesAndUnitNotes(
  poId: string,
  lines: Row[],
  dryRun = false,
): Promise<string> {
  const existing = await getPurchaseOrderById(poId);
  const poHeader = (existing?.purchaseorder || {}) as Record<string, unknown>;
  const currentNotes = String(poHeader.notes || '');
  const newLine = kaiPoNote(lines);
  const nextNotes = rewriteHeaderNotes(currentNotes, newLine);

  const patch: Record<string, unknown> = {};
  if (nextNotes != null) patch.notes = nextNotes;

  const serialMap = unitNotesByLineItemId(lines);
  if (Object.keys(serialMap).length > 0 && poHeader.line_items) {
    try {
      assertPurchaseOrderLineItemsEditable(existing);
      const built = buildPurchaseOrderLineItemsForDescriptionPut(existing.purchaseorder!, serialMap);
      if (built.length > 0) patch.line_items = built;
    } catch (err) {
      console.warn(
        `  unit notes skip (lines not editable):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (Object.keys(patch).length === 0) {
    console.log(`  notes: already ${newLine}`);
    return newLine;
  }
  if (dryRun) {
    if (patch.notes != null) {
      console.log(`  notes PLAN: prepend "${newLine}"`);
      const firstCurrent = currentNotes.split('\n')[0] ?? '(empty)';
      console.log(`  notes current first line: ${firstCurrent}`);
    }
    if (patch.line_items) {
      for (const [liId, snippet] of Object.entries(serialMap)) {
        console.log(`  unit note PLAN line ${liId}: ${snippet}`);
      }
    }
    return newLine;
  }
  await updatePurchaseOrder(poId, patch);
  console.log(
    `  notes: ${newLine}${patch.line_items ? ` + ${Object.keys(serialMap).length} line desc` : ''}`,
  );
  return newLine;
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

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `ops-zoho-receive-backlog — Zoho receive + unit notes + PO notes + stamps${dryRun ? ' (DRY RUN)' : ''}\n`,
  );
  const rows = await loadBacklog();
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
        const plan = await planReceive(poId, lines);
        console.log(
          `  live Zoho: status=${plan.liveStatus || '—'} number=${plan.liveNumber ?? '—'} → decision=${plan.decision}`,
        );
        if (plan.unmatchedLocalLines.length > 0) {
          console.warn(
            `  WARNING local lines not on live PO: ${plan.unmatchedLocalLines.join(', ')}`,
          );
        }
        for (const li of plan.lineItems) {
          console.log(
            `  receive PLAN line ${li.line_item_id}: qty=${li.quantity_received} item=${li.item_id}`,
          );
        }

        if (dryRun) {
          receiveState = `plan:${plan.decision}`;
          if (plan.decision !== 'terminal') {
            notesLine = await patchPoNotesAndUnitNotes(poId, lines, true);
          }
          console.log(`PLAN\t${label}\t${receiveState}\t${notesLine || '—'}`);
          console.log('');
          continue;
        }

        let receiveId: string | null = plan.existingReceiveId;
        if (plan.decision === 'terminal') {
          receiveState = 'terminal';
        } else if (plan.decision === 'receive') {
          const { outcome, receiveId: rid } = await executeReceive(poId, lines, plan);
          receiveId = rid;
          receiveState = outcome;
          console.log(`  Zoho receive: ${outcome}${rid ? ` id=${rid}` : ''}`);
        } else {
          // nothing-pending: Zoho may have received outside our view; fall
          // back to the latest existing receive id for the stamp.
          receiveId = await latestReceiveIdForPo(poId);
          receiveState = 'already';
          console.log(`  Zoho receive: already (nothing pending)`);
        }

        try {
          notesLine = await patchPoNotesAndUnitNotes(poId, lines);
        } catch (err) {
          console.warn(`  notes skip:`, err instanceof Error ? err.message : err);
        }

        try {
          const mirror = await syncOnePoMirror(poId, DOGFOOD_ORG_ID);
          console.log(`  mirror: found=${mirror.found} status=${mirror.status}`);
        } catch (err) {
          console.warn(`  mirror skip:`, err instanceof Error ? err.message : err);
        }

        await stampReceiveIds(lines, receiveId);
        const promoted = await promoteLinesDone(lines);
        console.log(`  local DONE: ${promoted} newly promoted`);
      } catch (err) {
        console.error(`  FAILED:`, err instanceof Error ? `${err.name}: ${err.message}` : err);
      }
      if (!dryRun) {
        console.log(`RESULT\t${label}\t${receiveState}\t${notesLine || '—'}`);
        console.log('');
      }
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
