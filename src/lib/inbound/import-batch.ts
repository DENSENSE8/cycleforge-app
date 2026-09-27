/**
 * Bulk inbound: many rows (a CSV, a sync page) → orders → the one writer.
 *
 *   1. rows are grouped into InboundOrderDrafts — one per (source, platform,
 *      order number), each row one line;
 *   2. the batch is recorded (`inbound_import_batch`) and every order gets a
 *      ledger row keyed by (batch content hash, order) — a re-posted file is
 *      recognised, an unchanged order is skipped;
 *   3. dry run: every order is previewed (nothing lands); commit: every order
 *      lands in its own transaction through `ingestInboundOrder`, so one bad
 *      order never takes the batch down and never lands half-written.
 *
 * Also: `reconcileInboundSpine`, the drift check between the ledger, the
 * order headers and the spine lines.
 */

import { createHash } from 'node:crypto';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { deskRowFromCsvRecord, resolveCatalogByAsinSku } from './desk-import';
import type { DeskImportRow } from './desk-csv';
import {
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  INBOUND_ORDER_TYPES,
  INBOUND_PRIORITY_AUTO,
  normalizeInboundOrderNumber,
  type InboundOrderDraft,
  type InboundOrderType,
} from './inbound-order-draft';
import {
  ingestInboundOrder,
  previewInboundOrder,
  InboundOrderRefused,
  type InboundOrderOrigin,
  type IngestInboundOrderResult,
} from './ingest-inbound-order';
import { tagInboundAsReturn } from './tag-inbound-return';
import { receiveImportedLineIfCartonUnboxed } from './receive-if-carton-unboxed';

export interface BatchOrderDraft {
  /** Row indexes (into the input) that became this order's lines. */
  rows: number[];
  draft: InboundOrderDraft;
}

export interface BatchSkippedRow {
  row: number;
  reason: string;
}

/** Group desk rows into order drafts. Amazon native returns resolve their catalog item by SKU, then ASIN. */
export async function draftsFromDeskRows(
  orgId: OrgId,
  rows: readonly DeskImportRow[],
  resolveCatalog: typeof resolveCatalogByAsinSku = resolveCatalogByAsinSku,
): Promise<{ orders: BatchOrderDraft[]; skipped: BatchSkippedRow[] }> {
  const byKey = new Map<string, BatchOrderDraft>();
  const skipped: BatchSkippedRow[] = [];

  for (const [index, row] of rows.entries()) {
    if (row.skipReason) {
      skipped.push({ row: index, reason: row.skipReason });
      continue;
    }
    const platform = row.sourcePlatform?.trim() || row.sourceType;
    const orderNumber = row.orderId.trim();
    if (!orderNumber) {
      skipped.push({ row: index, reason: 'no order number' });
      continue;
    }
    const upper = (row.receivingType ?? '').trim().toUpperCase() || (row.kind === 'return' ? 'RETURN' : 'PO');
    const type: InboundOrderType = (INBOUND_ORDER_TYPES as readonly string[]).includes(upper) ? (upper as InboundOrderType) : 'PO';

    let skuCatalogId = row.skuCatalogId ?? null;
    let sku = row.sku?.trim() ?? '';
    let title = row.itemName?.trim() ?? '';
    if (skuCatalogId == null && row.amazonNativeReturn) {
      for (const needle of [sku, row.amazonAsin?.trim() ?? ''].filter(Boolean)) {
        const hit = await resolveCatalog(orgId, needle);
        if (hit) {
          skuCatalogId = hit.id;
          sku = hit.sku;
          title ||= hit.product_title;
          break;
        }
      }
    }
    if (!sku && !title && skuCatalogId == null) title = row.amazonNativeReturn ? `Amazon return ${orderNumber}` : '';

    const key = `${type}|${platform.toLowerCase()}|${normalizeInboundOrderNumber(orderNumber)}`;
    let order = byKey.get(key);
    if (!order) {
      order = {
        rows: [],
        draft: {
          ...emptyInboundOrderDraft(type),
          platform,
          orderNumber,
          vendor: row.seller?.trim() ?? '',
          accountName: row.accountName?.trim() ?? '',
          priority: row.priorityTier != null ? (String(row.priorityTier) as InboundOrderDraft['priority']) : INBOUND_PRIORITY_AUTO,
          tracking: [],
          lines: [],
          returnReason: row.returnReason?.trim() ?? '',
          rmaId: row.rmaId?.trim() ?? '',
        },
      };
      byKey.set(key, order);
    }
    order.rows.push(index);
    order.draft.lines.push({
      ...emptyInboundOrderLine(),
      lineKey: row.lineItemId?.trim() ?? '',
      skuCatalogId,
      sku,
      title,
      quantity: row.quantity ?? 1,
      listingUrl: row.listingUrl?.trim() ?? '',
      itemNumber: row.amazonAsin?.trim() ?? '',
    });
    const tracking = row.trackingNumber?.trim();
    if (tracking && !order.draft.tracking.some((t) => t.number === tracking) && order.draft.tracking.length < 10) {
      order.draft.tracking.push({ number: tracking, carrier: row.carrierCode?.trim() ?? '' });
    }
  }
  for (const order of byKey.values()) {
    if (order.draft.tracking.length === 0) order.draft.tracking = [{ number: '', carrier: '' }];
  }
  return { orders: [...byKey.values()], skipped };
}

export interface BatchOrderOutcome {
  orderNumber: string;
  rows: number[];
  status: 'valid' | 'invalid' | 'landed' | 'unchanged' | 'failed';
  created?: boolean;
  inboundOrderId?: number;
  lines?: number;
  error?: string;
}

export interface InboundImportBatchResult {
  batchId: number;
  dryRun: boolean;
  total: number;
  orders: BatchOrderOutcome[];
  skipped: BatchSkippedRow[];
  counts: { landed: number; unchanged: number; valid: number; invalid: number; failed: number; skipped: number };
}

/** A RETURN that lands tags its lines and receives any whose carton was already unboxed. */
async function finishReturn(orgId: OrgId, result: IngestInboundOrderResult, draft: InboundOrderDraft): Promise<void> {
  for (const line of result.lines) {
    await tagInboundAsReturn(orgId, {
      receivingLineId: line.receivingLineId,
      sourceType: result.identity.sourceType,
      sourceOrderId: result.identity.externalOrderId,
      returnReason: draft.returnReason || null,
      rmaRef: draft.rmaId || null,
    });
    await receiveImportedLineIfCartonUnboxed(orgId, line.receivingLineId);
  }
}

export async function runInboundImportBatch(
  orgId: OrgId,
  input: {
    rows: ReadonlyArray<Record<string, string>>;
    origin: Exclude<InboundOrderOrigin, 'manual'>;
    source: string;
    staffId: number | null;
    label?: string | null;
    dryRun: boolean;
  },
): Promise<InboundImportBatchResult> {
  const deskRows = input.rows.map((record) => deskRowFromCsvRecord(record));
  const { orders, skipped } = await draftsFromDeskRows(orgId, deskRows);
  const fileHash = createHash('sha256').update(JSON.stringify(input.rows)).digest('hex').slice(0, 24);

  const batch = await tenantQuery<{ id: number }>(
    orgId,
    `INSERT INTO inbound_import_batch (organization_id, origin, source, label, status, total, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [orgId, input.origin, input.source, input.label ?? null, input.dryRun ? 'staged' : 'committing', orders.length, input.staffId],
  );
  const batchId = Number(batch.rows[0].id);

  const outcomes: BatchOrderOutcome[] = [];
  for (const order of orders) {
    const base = { orderNumber: order.draft.orderNumber, rows: order.rows };
    if (input.dryRun) {
      try {
        const preview = await previewInboundOrder(orgId, order.draft, { returnClaim: false });
        outcomes.push(
          preview.missing.length
            ? { ...base, status: 'invalid', error: preview.missing.map((m) => m.label).join('; ') }
            : { ...base, status: preview.unchanged ? 'unchanged' : 'valid', inboundOrderId: preview.existing?.inboundOrderId, lines: preview.lines.length },
        );
      } catch (err) {
        outcomes.push({ ...base, status: 'invalid', error: err instanceof Error ? err.message : 'invalid' });
      }
      continue;
    }
    try {
      const result = await ingestInboundOrder(orgId, order.draft, {
        origin: input.origin,
        source: input.source,
        staffId: input.staffId,
        batchId,
        sourceEventId: `${input.source}:${fileHash}:${normalizeInboundOrderNumber(order.draft.orderNumber)}:${order.draft.platform}`,
      });
      if (order.draft.type === 'RETURN' && !result.unchanged) await finishReturn(orgId, result, order.draft);
      outcomes.push({
        ...base,
        status: result.unchanged ? 'unchanged' : 'landed',
        created: result.created,
        inboundOrderId: result.inboundOrderId,
        lines: result.lines.length,
      });
    } catch (err) {
      outcomes.push({
        ...base,
        status: err instanceof InboundOrderRefused ? 'invalid' : 'failed',
        error: err instanceof Error ? err.message : 'import failed',
      });
    }
  }

  const count = (s: BatchOrderOutcome['status']) => outcomes.filter((o) => o.status === s).length;
  const counts = {
    landed: count('landed'),
    unchanged: count('unchanged'),
    valid: count('valid'),
    invalid: count('invalid'),
    failed: count('failed'),
    skipped: skipped.length,
  };
  await tenantQuery(
    orgId,
    `UPDATE inbound_import_batch
        SET status = $2, valid = $3, landed = $4, failed = $5,
            committed_at = CASE WHEN $2 = 'committed' THEN now() END, updated_at = now()
      WHERE organization_id = $1 AND id = $6`,
    [
      orgId,
      input.dryRun ? 'validated' : counts.failed + counts.invalid > 0 && counts.landed + counts.unchanged === 0 ? 'failed' : 'committed',
      counts.valid + counts.landed + counts.unchanged,
      counts.landed,
      counts.failed + counts.invalid,
      batchId,
    ],
  );

  return { batchId, dryRun: input.dryRun, total: deskRows.length, orders: outcomes, skipped, counts };
}

// ─── reconciliation ──────────────────────────────────────────────────────────

export interface InboundSpineReconciliation {
  /** Spine lines that carry an external identity but no internal order. */
  linesWithoutOrder: number;
  /** Order headers with no line (a landing that lost its lines). */
  ordersWithoutLines: number;
  /** Lines whose purchase link and order disagree on the source order. */
  linkOrderMismatch: number;
  /** Ledger events still failing, and dead (retry budget spent). */
  failedEvents: number;
  deadEvents: number;
  /** Ledger says landed, but the order it names is gone. */
  landedWithoutOrder: number;
}

/** Drift between the ledger, the headers and the spine — every number should be 0. */
export async function reconcileInboundSpine(orgId: OrgId): Promise<InboundSpineReconciliation> {
  const r = await tenantQuery<Record<keyof InboundSpineReconciliation, number>>(
    orgId,
    `SELECT
       (SELECT count(*)::int FROM receiving_line rl
         WHERE rl.organization_id = $1 AND rl.inbound_order_id IS NULL
           AND (rl.inbound_source_type IS NOT NULL
                OR EXISTS (SELECT 1 FROM receiving_line_zoho rz
                            WHERE rz.receiving_line_id = rl.id AND rz.zoho_purchaseorder_id IS NOT NULL))) AS "linesWithoutOrder",
       (SELECT count(*)::int FROM inbound_order io
         WHERE io.organization_id = $1
           AND NOT EXISTS (SELECT 1 FROM receiving_line rl WHERE rl.inbound_order_id = io.id)) AS "ordersWithoutLines",
       (SELECT count(*)::int FROM receiving_line rl
          JOIN inbound_order io ON io.id = rl.inbound_order_id
          JOIN inbound_purchase_order_links l
            ON l.receiving_line_id = rl.id AND l.organization_id = rl.organization_id AND l.is_primary
         WHERE rl.organization_id = $1
           AND (l.source_type <> io.source_type
                OR inbound_order_number_norm(l.source_order_id) <> io.external_order_id_norm)) AS "linkOrderMismatch",
       (SELECT count(*)::int FROM inbound_ingest_event WHERE organization_id = $1 AND status = 'failed') AS "failedEvents",
       (SELECT count(*)::int FROM inbound_ingest_event WHERE organization_id = $1 AND status = 'dead') AS "deadEvents",
       (SELECT count(*)::int FROM inbound_ingest_event e
         WHERE e.organization_id = $1 AND e.status = 'landed'
           AND NOT (COALESCE(e.outcome, '{}'::jsonb) ? 'deletedOrderId')
           AND (e.inbound_order_id IS NULL
                OR NOT EXISTS (SELECT 1 FROM inbound_order io WHERE io.id = e.inbound_order_id))) AS "landedWithoutOrder"`,
    [orgId],
  );
  return r.rows[0];
}
