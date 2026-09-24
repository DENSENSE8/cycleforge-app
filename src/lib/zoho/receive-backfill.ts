/**
 * Bulk purchase-receive backfill — the ONE path that pushes locally-received
 * lines into the inventory provider.
 *
 * ## Why this exists
 *
 * Until 2026-09-23 the push rode the `mark-received-po` request tail: one
 * `GET /purchaseorders/{id}` + one `POST /purchasereceives` per receive, with
 * the station composer parked on "Syncing to inventory…" until an Ably verdict
 * landed. The transport makes that indefensible — `zoho/httpClient.ts` enforces
 * 80 req/min, a 750 ms floor between dispatches, and a 55 s timeout on
 * `/purchasereceives`. A twelve-line carton spent ~18 s in forced spacing alone,
 * for work the operator cannot act on and does not need to watch.
 *
 * `createPurchaseReceive` has always accepted N lines per PO in one POST, so
 * the fix is not a new Zoho capability — it is grouping. One receive per PO
 * per run instead of one per line collapses that same carton to two calls.
 *
 * ## The worklist is DERIVED, never a queue table
 *
 * "Locally DONE + Zoho-linked + no `zoho_purchase_receive_id` yet" IS the
 * backlog. That means no outbox to dual-write, no rows to leak when a run dies
 * mid-flight, and `pending → 0` doubles as the progress readout the Backfill
 * button renders. A crashed run self-heals on the next tick because nothing was
 * ever checked out.
 *
 * The only state a derived worklist cannot hold is retry state, so
 * `receiving_line_zoho` carries `zoho_receive_attempts` /
 * `_attempted_at` / `_error` (2026-09-23c). They exist for one reason: a PO
 * Zoho permanently refuses must not be retried on every tick ahead of the POs
 * behind it. Same lesson as `order_ingest_queue.attempts`.
 *
 * ## Callers
 *   - `GET /api/cron/zoho/receive-backfill` — the scheduled drain (all orgs).
 *   - `POST /api/zoho/receive-backfill`     — the operator's Backfill button.
 * Both run the same function; the button is a cadence override, not a fork.
 */
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getInventoryProvider } from '@/lib/integrations/inventory';
import type { InventoryProvider } from '@/lib/integrations/inventory/types';
import {
  assertPurchaseOrderReceivable,
  catalogItemIdFromZohoPoLineItem,
  getPurchaseReceiveIdFromCreateResponse,
} from '@/lib/zoho';
import { ZohoNotConnectedError } from '@/lib/zoho/core';
import { formatPSTTimestamp } from '@/utils/date';

/** Attempts after which a line stops being claimed and waits for a human. */
export const MAX_RECEIVE_ATTEMPTS = 6;

/**
 * Backoff step. A failed line waits `attempts × this` before it is claimed
 * again — a linear ladder (2, 4, 6, … minutes) that reaches the ceiling below
 * in about 40 minutes.
 *
 * Short and linear on purpose: the two failures this drain actually sees are
 * "Zoho is throttling" (clears in a minute) and "this PO line has no catalog
 * item_id" (never clears without a human). An exponential ladder would only
 * punish the first, and the attempt ceiling already retires the second.
 */
const BACKOFF_STEP_MINUTES = 2;

export interface PendingReceiveLine {
  receivingLineId: number;
  zohoPurchaseOrderId: string;
  zohoLineItemId: string;
  sku: string | null;
  attempts: number;
}

/** Lines for one Zoho PO — the unit of work, and the unit of one POST. */
export interface PendingReceiveGroup {
  zohoPurchaseOrderId: string;
  lines: PendingReceiveLine[];
}

export interface ReceiveBacklog {
  /** Lines received locally but not yet acknowledged by the provider. */
  pending: number;
  /** Distinct POs those lines belong to — the real call count of a full run. */
  purchaseOrders: number;
  /** Lines parked at the attempt ceiling; these need a human, not a retry. */
  blocked: number;
  /** Oldest pending line's local receive time, ISO, or null when clear. */
  oldestAt: string | null;
  /** Most recent failure across the backlog — the operator's one-line "why". */
  lastError: string | null;
}

/**
 * `not_connected` is deliberately NOT a kind of `failed`: it stamps nothing,
 * burns no attempt, and aborts the rest of the run, because every remaining
 * group would hit the same dead credential.
 */
export type GroupOutcome = 'posted' | 'noop' | 'failed' | 'not_connected';

export interface GroupResult {
  zohoPurchaseOrderId: string;
  outcome: GroupOutcome;
  /** Lines this group covered (stamped on `posted`/`noop`). */
  lineIds: number[];
  /** Provider purchase-receive id when one was minted. */
  purchaseReceiveId: string | null;
  /** Why a `noop` was a no-op, or why a `failed` failed. */
  reason?: string;
}

export interface BackfillReport {
  /** PO groups actually attempted this run. */
  groups: number;
  /** Groups the provider accepted a receive for. */
  posted: number;
  /** Groups the provider was already at or ahead of. */
  noop: number;
  /** Groups that errored — these stay in the backlog with their error stamped. */
  failed: number;
  /** Receiving lines settled against the provider this run, live path only. */
  lines: number;
  /**
   * Lines settled from `zoho_po_mirror` with NO provider call. The mirror is
   * refreshed every 15 min by `zoho.po_sync`, so a PO it already reports
   * terminal needs no round-trip to confirm.
   */
  settledFromMirror: number;
  /** Backlog remaining after the run — the progress denominator's numerator. */
  pendingAfter: number;
  /**
   * The run stopped because the inventory connection is dead. Distinct from
   * `failed`: nothing was attempted and nothing was stamped, so the operator
   * needs to re-authorize, not investigate a PO.
   */
  notConnected: boolean;
  errors: Array<{ zohoPurchaseOrderId: string; error: string }>;
}

export interface BackfillDeps {
  query: typeof tenantQuery;
  resolveProvider: (orgId: OrgId) => Promise<InventoryProvider | null>;
  now: () => string;
}

const defaultDeps: BackfillDeps = {
  query: tenantQuery,
  resolveProvider: getInventoryProvider,
  now: formatPSTTimestamp,
};

/**
 * The pending-push predicate, shared by the count, the claim and the mirror
 * settle so the number the operator watches and the rows the drain works can
 * never disagree.
 *
 * `rl.workflow_status = 'DONE'` is the local receive: the floor committed the
 * units, the ledger moved, and only the provider acknowledgement is missing.
 *
 * Both Zoho columns must be NULL. `zoho_purchase_receive_id` means WE minted a
 * receive; `zoho_receive_settled_at` is the weaker claim that the provider is
 * at or ahead of us — which is how a PO Zoho reports already-received leaves
 * the queue even though there is no receive id to write (2026-09-23d).
 */
const PENDING_PREDICATE = `
        rl.organization_id = $1
    AND rl.workflow_status = 'DONE'
    AND rz.zoho_purchase_receive_id IS NULL
    AND rz.zoho_receive_settled_at  IS NULL
    AND rz.zoho_purchaseorder_id    IS NOT NULL
    AND rz.zoho_line_item_id        IS NOT NULL`;

/**
 * Backlog readout. Drives both the cron summary and the Backfill button's
 * progress bar — the bar is literally this number falling, which is why there
 * is no separate progress channel to keep honest.
 */
export async function getReceiveBacklog(
  orgId: OrgId,
  deps: BackfillDeps = defaultDeps,
): Promise<ReceiveBacklog> {
  const { rows } = await deps.query<{
    pending: string;
    purchase_orders: string;
    blocked: string;
    oldest_at: string | null;
    last_error: string | null;
  }>(
    orgId,
    `SELECT COUNT(*)::text                                   AS pending,
            COUNT(DISTINCT rz.zoho_purchaseorder_id)::text   AS purchase_orders,
            COUNT(*) FILTER (
              WHERE rz.zoho_receive_attempts >= $2
            )::text                                          AS blocked,
            MIN(rl.updated_at)                               AS oldest_at,
            (ARRAY_REMOVE(ARRAY_AGG(
               rz.zoho_receive_error ORDER BY rz.zoho_receive_attempted_at DESC NULLS LAST
             ), NULL))[1]                                    AS last_error
       FROM receiving_line rl
       JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id
        AND rz.organization_id   = rl.organization_id
      WHERE ${PENDING_PREDICATE}`,
    [orgId, MAX_RECEIVE_ATTEMPTS],
  );

  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    purchaseOrders: Number(row?.purchase_orders ?? 0),
    blocked: Number(row?.blocked ?? 0),
    oldestAt: row?.oldest_at ? new Date(row.oldest_at).toISOString() : null,
    lastError: row?.last_error ?? null,
  };
}

/**
 * Claim the next PO groups to push.
 *
 * Ordered by PO so a group is never split across runs, and filtered on the
 * backoff clock + attempt ceiling so a permanently-refused PO drops out of
 * rotation instead of holding the head of the queue.
 */
export async function listPendingReceiveGroups(
  orgId: OrgId,
  opts: { maxGroups?: number } = {},
  deps: BackfillDeps = defaultDeps,
): Promise<PendingReceiveGroup[]> {
  const maxGroups = Math.max(1, Math.min(opts.maxGroups ?? 25, 200));

  const { rows } = await deps.query<{
    id: number;
    sku: string | null;
    zoho_purchaseorder_id: string;
    zoho_line_item_id: string;
    zoho_receive_attempts: number;
  }>(
    orgId,
    `WITH claimable AS (
       SELECT rl.id,
              rl.sku,
              rz.zoho_purchaseorder_id,
              rz.zoho_line_item_id,
              rz.zoho_receive_attempts,
              rz.zoho_receive_attempted_at
         FROM receiving_line rl
         JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id
          AND rz.organization_id   = rl.organization_id
        WHERE ${PENDING_PREDICATE}
          AND rz.zoho_receive_attempts < $2
          AND (
                rz.zoho_receive_attempted_at IS NULL
             OR rz.zoho_receive_attempted_at <
                  now() - (make_interval(mins => $3::int) * GREATEST(rz.zoho_receive_attempts, 1))
              )
     ),
     ranked AS (
       SELECT zoho_purchaseorder_id,
              MIN(zoho_receive_attempts) AS attempts
         FROM claimable
        GROUP BY zoho_purchaseorder_id
        ORDER BY attempts ASC, zoho_purchaseorder_id ASC
        LIMIT $4
     )
     SELECT c.id, c.sku, c.zoho_purchaseorder_id, c.zoho_line_item_id, c.zoho_receive_attempts
       FROM claimable c
       JOIN ranked r ON r.zoho_purchaseorder_id = c.zoho_purchaseorder_id
      ORDER BY c.zoho_purchaseorder_id ASC, c.id ASC`,
    [orgId, MAX_RECEIVE_ATTEMPTS, BACKOFF_STEP_MINUTES, maxGroups],
  );

  const byPo = new Map<string, PendingReceiveGroup>();
  for (const row of rows) {
    const poId = String(row.zoho_purchaseorder_id);
    let group = byPo.get(poId);
    if (!group) {
      group = { zohoPurchaseOrderId: poId, lines: [] };
      byPo.set(poId, group);
    }
    group.lines.push({
      receivingLineId: Number(row.id),
      zohoPurchaseOrderId: poId,
      zohoLineItemId: String(row.zoho_line_item_id),
      sku: row.sku,
      attempts: Number(row.zoho_receive_attempts ?? 0),
    });
  }
  return [...byPo.values()];
}

/**
 * Remaining quantity per PO line: ordered − already warehouse-received.
 *
 * Moved here verbatim from `mark-received-po` when the push left the request
 * tail. PO `quantity_received` is the *invoiced* count, not the warehouse one,
 * so the pending math has to read the provider's receive totals or it will
 * re-post quantities Zoho already holds.
 */
async function pendingLineItems(
  inventory: InventoryProvider,
  poDetail: { purchaseorder?: { line_items?: unknown[] } },
  group: PendingReceiveGroup,
): Promise<{ line_item_id: string; quantity_received: number; item_id: string }[]> {
  const receivedTotals = await inventory.sumWarehouseReceivedByPoLineItem(
    group.zohoPurchaseOrderId,
  );
  const wanted = new Map(group.lines.map((l) => [l.zohoLineItemId, l] as const));
  const items = Array.isArray(poDetail.purchaseorder?.line_items)
    ? poDetail.purchaseorder!.line_items!
    : [];

  const out: { line_item_id: string; quantity_received: number; item_id: string }[] = [];
  const unmatched = new Set(wanted.keys());

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const li = raw as Record<string, unknown>;
    const id = String(li.line_item_id ?? li.id ?? '').trim();
    if (!id || !wanted.has(id)) continue;
    unmatched.delete(id);

    const ordered = Number(li.quantity ?? 0);
    if (!Number.isFinite(ordered) || ordered <= 0) continue;
    const pending = Math.max(0, Math.floor(ordered - (receivedTotals.get(id) ?? 0) + 1e-9));
    if (pending <= 0) continue;

    let itemId = catalogItemIdFromZohoPoLineItem(raw) || '';
    if (!itemId) {
      // The PO payload omits item_id on some plans; the SKU lookup is the
      // documented recovery. Zoho answers "Select an item." without it.
      const sku = String(wanted.get(id)?.sku ?? '').trim();
      if (sku) {
        try {
          const hit = await inventory.findItemBySku(sku);
          itemId = hit?.item_id ? String(hit.item_id).trim() : '';
        } catch {
          itemId = '';
        }
      }
    }
    if (!itemId) {
      const sku = wanted.get(id)?.sku;
      throw new Error(
        `Zoho PO line ${id} has no catalog item_id${sku ? ` (SKU ${sku})` : ''}. ` +
          `Open the PO in Zoho or re-link this line — Zoho rejects a receive without item_id.`,
      );
    }
    out.push({ line_item_id: id, quantity_received: pending, item_id: itemId });
  }

  if (unmatched.size > 0) {
    throw new Error(
      `Zoho PO ${group.zohoPurchaseOrderId} no longer carries line_item_id(s): ` +
        `${[...unmatched].join(', ')}. Re-sync the PO.`,
    );
  }
  return out;
}

/** Zoho phrasings that all mean "we are already at or ahead of you". */
function isAlreadyReceived(message: string): boolean {
  return (
    /already\s+created\s+a\s+receive\s+for\s+all\s+the\s+items/i.test(message) ||
    /already\s+(fully\s+)?received/i.test(message) ||
    /marked\s+as\s+received/i.test(message)
  );
}

/**
 * The credential is gone, not the work.
 *
 * `getInventoryProvider` hands back an adapter without touching credentials —
 * the vault read happens inside the first call. So a revoked or expired
 * connection surfaces HERE, past the null-provider guard, and the naive
 * reading is "this PO failed". It is not: nothing was attempted, and treating
 * it as a failure drives EVERY pending line to the attempt ceiling within one
 * backoff ladder (~40 min) while an operator is re-authorizing. The lines
 * would then stay parked after the reconnect, needing a manual counter reset.
 */
function isNotConnected(err: unknown): boolean {
  if (err instanceof ZohoNotConnectedError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /no active zoho connection|not connected|oauth\/authorize/i.test(message);
}

function isTerminalPoStatus(status: unknown): boolean {
  const s = String(status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return s === 'received' || s === 'billed' || s === 'closed';
}

/**
 * Take a line out of the backlog.
 *
 * `zoho_receive_settled_at` is what ends the claim — NOT the receive id, which
 * several legitimate provider paths never hand back (`markasreceived` on a
 * billed PO, the "already created a receive" response, a PO Zoho reports
 * terminal before we call). Keying the predicate on the id alone left exactly
 * those lines cycling through the queue until they retired at the attempt
 * ceiling as if they had failed.
 */
async function stampSettled(
  orgId: OrgId,
  lineIds: number[],
  purchaseReceiveId: string | null,
  syncedAt: string,
  deps: BackfillDeps,
): Promise<void> {
  if (lineIds.length === 0) return;
  await deps.query(
    orgId,
    `UPDATE receiving_line_zoho
        SET zoho_purchase_receive_id  = COALESCE(zoho_purchase_receive_id, $3),
            zoho_receive_settled_at   = now(),
            zoho_synced_at            = $4,
            zoho_receive_attempts     = zoho_receive_attempts + 1,
            zoho_receive_attempted_at = now(),
            zoho_receive_error        = NULL,
            updated_at                = now()
      WHERE organization_id  = $1
        AND receiving_line_id = ANY($2::int[])`,
    [orgId, lineIds, purchaseReceiveId, syncedAt],
  );
}

/**
 * Settle every pending line whose PO the local mirror ALREADY reports terminal,
 * in one statement and zero provider calls.
 *
 * This is not an optimization at the margin. On the first live run 1561 of 1566
 * pending POs were already `received` in `zoho_po_mirror` — lines the floor
 * received months ago whose local row simply never recorded the acknowledgement.
 * Confirming that over the wire would have been ~20 minutes of rate-limited
 * round-trips to learn what `zoho.po_sync` writes into this table every 15
 * minutes anyway.
 *
 * Safe against a stale mirror in the only direction that matters: a lagging
 * mirror reports the OLDER status, which routes the PO to the live path. It
 * cannot invent a terminal status for a PO that is still open.
 */
async function settleAgainstMirror(
  orgId: OrgId,
  deps: BackfillDeps,
): Promise<number> {
  // The mirror join keys off `rz`, the UPDATE target. Postgres forbids
  // referencing the target inside a `FROM … JOIN … ON`, so both relations are
  // plain FROM entries and every correlation lives in WHERE.
  const { rowCount } = await deps.query(
    orgId,
    `UPDATE receiving_line_zoho rz
        SET zoho_receive_settled_at   = now(),
            zoho_receive_attempted_at = now(),
            zoho_receive_error        = NULL,
            updated_at                = now()
       FROM receiving_line rl, zoho_po_mirror m
      WHERE rz.receiving_line_id = rl.id
        AND rz.organization_id   = rl.organization_id
        AND m.zoho_purchaseorder_id::text = rz.zoho_purchaseorder_id
        AND m.organization_id    = rl.organization_id
        AND m.status IN ('received', 'billed', 'closed')
        AND ${PENDING_PREDICATE}`,
    [orgId],
  );
  return rowCount ?? 0;
}

async function stampFailure(
  orgId: OrgId,
  lineIds: number[],
  error: string,
  deps: BackfillDeps,
): Promise<void> {
  if (lineIds.length === 0) return;
  await deps.query(
    orgId,
    `UPDATE receiving_line_zoho
        SET zoho_receive_attempts     = zoho_receive_attempts + 1,
            zoho_receive_attempted_at = now(),
            zoho_receive_error        = $3,
            updated_at                = now()
      WHERE organization_id  = $1
        AND receiving_line_id = ANY($2::int[])`,
    [orgId, lineIds, error.slice(0, 1000)],
  );
}

/**
 * Push one PO's pending lines as a single purchase receive.
 *
 * A `noop` is as final as a `posted`: both mean the provider now reflects the
 * local receive, so both stamp the lines out of the backlog. Collapsing them
 * into "success" would be wrong in the other direction — the cron summary keeps
 * them apart so a run that posted nothing because everything was already
 * received does not read as a run that posted nothing because Zoho was down.
 */
async function pushGroup(
  orgId: OrgId,
  inventory: InventoryProvider,
  group: PendingReceiveGroup,
  deps: BackfillDeps,
): Promise<GroupResult> {
  const lineIds = group.lines.map((l) => l.receivingLineId);

  try {
    const poResp = await inventory.getPurchaseOrder(group.zohoPurchaseOrderId);
    assertPurchaseOrderReceivable(poResp);

    if (isTerminalPoStatus(poResp.purchaseorder?.status)) {
      await stampSettled(orgId, lineIds, null, deps.now(), deps);
      return {
        zohoPurchaseOrderId: group.zohoPurchaseOrderId,
        outcome: 'noop',
        lineIds,
        purchaseReceiveId: null,
        reason: `po_already_${String(poResp.purchaseorder?.status).toLowerCase()}`,
      };
    }

    const lineItems = await pendingLineItems(inventory, poResp, group);

    // Nothing pending per line but the PO is still open: the billed-PO shape
    // Zoho cannot express as line quantities without `bills.READ`. Its own
    // "Mark as Received" button is the documented escape, so take it.
    if (lineItems.length === 0) {
      const whole = await inventory.markPurchaseOrderReceivedWhole(group.zohoPurchaseOrderId);
      const wholeId = getPurchaseReceiveIdFromCreateResponse(whole);
      await stampSettled(orgId, lineIds, wholeId, deps.now(), deps);
      return {
        zohoPurchaseOrderId: group.zohoPurchaseOrderId,
        outcome: 'posted',
        lineIds,
        purchaseReceiveId: wholeId,
        reason: 'whole_po_markasreceived',
      };
    }

    const resp = await inventory.markPurchaseOrderReceived({
      purchaseOrderId: group.zohoPurchaseOrderId,
      lineItems,
      bills: poResp.purchaseorder?.bills,
    });
    const receiveId = getPurchaseReceiveIdFromCreateResponse(resp);
    await stampSettled(orgId, lineIds, receiveId, deps.now(), deps);
    return {
      zohoPurchaseOrderId: group.zohoPurchaseOrderId,
      outcome: 'posted',
      lineIds,
      purchaseReceiveId: receiveId,
    };
  } catch (err) {
    // Checked before anything else: a dead credential must never look like a
    // bad PO. Stamping here is what would park healthy lines at the ceiling.
    if (isNotConnected(err)) {
      return {
        zohoPurchaseOrderId: group.zohoPurchaseOrderId,
        outcome: 'not_connected',
        lineIds,
        purchaseReceiveId: null,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (isAlreadyReceived(message)) {
      await stampSettled(orgId, lineIds, null, deps.now(), deps);
      return {
        zohoPurchaseOrderId: group.zohoPurchaseOrderId,
        outcome: 'noop',
        lineIds,
        purchaseReceiveId: null,
        reason: 'provider_reports_already_received',
      };
    }
    await stampFailure(orgId, lineIds, message, deps);
    return {
      zohoPurchaseOrderId: group.zohoPurchaseOrderId,
      outcome: 'failed',
      lineIds,
      purchaseReceiveId: null,
      reason: message,
    };
  }
}

/**
 * Drain the backlog for one org.
 *
 * Groups are pushed sequentially on purpose: `zoho/httpClient.ts` already
 * serializes behind a 750 ms floor and an 8-deep concurrency gate, so fanning
 * out here would only move the queue from Zoho's limiter into ours while making
 * the per-group failure isolation harder to reason about.
 */
export async function runZohoReceiveBackfill(
  orgId: OrgId,
  opts: { maxGroups?: number } = {},
  deps: BackfillDeps = defaultDeps,
): Promise<BackfillReport> {
  const report: BackfillReport = {
    groups: 0,
    posted: 0,
    noop: 0,
    failed: 0,
    lines: 0,
    settledFromMirror: 0,
    pendingAfter: 0,
    notConnected: false,
    errors: [],
  };

  // Free half first: anything the mirror already calls terminal needs no wire.
  // Only what survives this is worth a provider round-trip.
  report.settledFromMirror = await settleAgainstMirror(orgId, deps);

  const groups = await listPendingReceiveGroups(orgId, opts, deps);
  report.groups = groups.length;

  if (groups.length === 0) {
    report.pendingAfter = (await getReceiveBacklog(orgId, deps)).pending;
    return report;
  }

  const inventory = await deps.resolveProvider(orgId);
  if (!inventory) {
    // Nothing was attempted, so nothing is stamped. Burning an attempt here
    // would push healthy lines toward the give-up ceiling while an operator
    // re-authorizes — see isNotConnected for the same rule one layer down.
    report.groups = 0;
    report.notConnected = true;
    report.pendingAfter = (await getReceiveBacklog(orgId, deps)).pending;
    return report;
  }

  for (const group of groups) {
    const result = await pushGroup(orgId, inventory, group, deps);
    if (result.outcome === 'not_connected') {
      // Every remaining group shares this credential. Stop; do not spend the
      // rest of the batch proving the same thing 24 more times.
      report.notConnected = true;
      report.groups = report.posted + report.noop + report.failed;
      break;
    }
    if (result.outcome === 'failed') {
      report.failed += 1;
      report.errors.push({
        zohoPurchaseOrderId: result.zohoPurchaseOrderId,
        error: result.reason ?? 'push failed',
      });
      continue;
    }
    if (result.outcome === 'posted') report.posted += 1;
    else report.noop += 1;
    report.lines += result.lineIds.length;
  }

  report.pendingAfter = (await getReceiveBacklog(orgId, deps)).pending;
  return report;
}
