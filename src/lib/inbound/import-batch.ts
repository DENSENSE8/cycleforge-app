/**
 * Bulk inbound: many rows (an import file, a sync page) → orders → the one writer.
 *
 *   1. rows are grouped into InboundOrderDrafts — one per (type, platform,
 *      order number), each row one line (`draftsFromDeskRows`);
 *   2. dry run: every order is previewed (nothing is written — not even the
 *      batch row) and reported new / updated / unchanged by content hash;
 *   3. commit: the batch is recorded (`inbound_import_batch`, with the file's
 *      name, preset, header row and column map), every order lands in its own
 *      transaction through `ingestInboundOrder` (its ledger row keyed by
 *      (file hash, order)), so one bad order never takes the batch down and
 *      never lands half-written; an unchanged order is skipped. Then every
 *      data row of the file is kept (`inbound_import_row`: the raw cells, the
 *      order / line it landed as, its status) for the upload check.
 *
 * An order the caller already found problems on (`problems`) is held whole —
 * reported, never previewed or landed.
 *
 * Also: `reconcileInboundSpine`, the drift check between the ledger, the
 * order headers and the spine lines.
 */

import { createHash } from 'node:crypto';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveCatalogByAsinSku } from './desk-import';
import type { DeskImportRow } from './desk-csv';
import {
  assignInboundLineKeys,
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  filledInboundLines,
  INBOUND_PRIORITY_AUTO,
  normalizeInboundOrderNumber,
  type InboundOrderDraft,
} from './inbound-order-draft';
import {
  ingestInboundOrder,
  previewInboundOrder,
  InboundOrderRefused,
  type InboundOrderOrigin,
  type IngestInboundOrderResult,
} from './ingest-inbound-order';
import { receiveImportedLineIfCartonUnboxed } from './receive-if-carton-unboxed';
import type { ImportRowStatus } from './import-check';

export interface BatchOrderDraft {
  /** Row indexes (into the input) that became this order's lines, in line order. */
  rows: number[];
  draft: InboundOrderDraft;
  /** Blocking problems found before the writer — the order is held, not landed. */
  problems?: string[];
}

export interface BatchSkippedRow {
  row: number;
  reason: string;
}

const NOTES_MAX = 2000;
/** `inboundOrderDraftSchema.tracking` max. */
const TRACKING_MAX = 500;

/** Group desk rows into order drafts. A row with `catalogLookup` resolves its catalog item by those needles, in order. */
export async function draftsFromDeskRows(
  orgId: OrgId,
  rows: readonly DeskImportRow[],
  resolveCatalog: typeof resolveCatalogByAsinSku = resolveCatalogByAsinSku,
): Promise<{ orders: BatchOrderDraft[]; skipped: BatchSkippedRow[] }> {
  const byKey = new Map<string, BatchOrderDraft>();
  const notesByKey = new Map<string, string[]>();
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
    const type = row.receivingType;

    let skuCatalogId: number | null = null;
    let sku = row.sku?.trim() ?? '';
    let title = row.itemName?.trim() ?? '';
    for (const needle of row.catalogLookup) {
      const hit = await resolveCatalog(orgId, needle);
      if (hit) {
        skuCatalogId = hit.id;
        sku = hit.sku;
        title ||= hit.product_title;
        break;
      }
    }

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
          priority: row.priorityTier != null ? (String(row.priorityTier) as InboundOrderDraft['priority']) : INBOUND_PRIORITY_AUTO,
          orderDate: row.orderDate,
          expectedDate: row.expectedDate,
          tracking: [],
          lines: [],
        },
      };
      byKey.set(key, order);
      notesByKey.set(key, []);
    }
    const draft = order.draft;
    // An order's first row that carries a header fact wins.
    draft.orderDate ??= row.orderDate;
    draft.expectedDate ??= row.expectedDate;
    draft.returnReason ||= row.returnReason?.trim() ?? '';
    draft.rmaId ||= row.rmaId?.trim() ?? '';
    if (row.returnRequestDate) draft.returnRequestDate ??= row.returnRequestDate;
    const notes = notesByKey.get(key)!;
    for (const fragment of (row.notes ?? '').split('\n').map((s) => s.trim())) {
      if (fragment && !notes.includes(fragment)) notes.push(fragment);
    }
    order.rows.push(index);
    draft.lines.push({
      ...emptyInboundOrderLine(),
      lineKey: row.lineItemId?.trim() ?? '',
      skuCatalogId,
      sku,
      title,
      // Null = the file left it blank — kept null so the order asks.
      quantity: row.quantity,
      unitCostCents: row.unitCostCents,
      listingUrl: row.listingUrl?.trim() ?? '',
      itemNumber: row.itemNumber?.trim() ?? '',
      conditionGrade: row.conditionGrade,
      listingSerials: row.listingSerials,
      fnsku: row.fnsku ?? '',
      licensePlateNumber: row.licensePlateNumber ?? '',
      disposition: row.disposition ?? '',
      customerComment: row.customerComment ?? '',
      // Per-row return facts — a report row per returned unit keeps its own reason / RMA / request date
      // (absent when blank, so a purchase line's content hash is unchanged).
      ...(row.returnReason?.trim() ? { returnReason: row.returnReason.trim() } : {}),
      ...(row.rmaId?.trim() ? { rmaId: row.rmaId.trim() } : {}),
      ...(row.returnRequestDate ? { returnRequestDate: row.returnRequestDate } : {}),
    });
    const tracking = row.trackingNumber?.trim();
    if (tracking && !draft.tracking.some((t) => t.number === tracking) && draft.tracking.length < TRACKING_MAX) {
      draft.tracking.push({ number: tracking, carrier: row.carrierCode?.trim() ?? '' });
    }
  }
  for (const [key, order] of byKey) {
    if (order.draft.tracking.length === 0) order.draft.tracking = [{ number: '', carrier: '' }];
    order.draft.notes = notesByKey.get(key)!.join('\n').slice(0, NOTES_MAX);
  }
  return { orders: [...byKey.values()], skipped };
}

export interface BatchOrderOutcome {
  orderNumber: string;
  rows: number[];
  status: 'valid' | 'invalid' | 'landed' | 'unchanged' | 'failed';
  /** By content hash against the order already on file. */
  change?: 'new' | 'updated' | 'unchanged';
  created?: boolean;
  inboundOrderId?: number;
  lines?: number;
  /** Urgency tier the order lands with ('auto' = the platform's default). */
  tier?: InboundOrderDraft['priority'];
  /** Everything that holds the order, one entry each. */
  problems?: string[];
  error?: string;
}

export interface InboundImportBatchResult {
  /** Null on a dry run — nothing is written. */
  batchId: number | null;
  dryRun: boolean;
  total: number;
  orders: BatchOrderOutcome[];
  skipped: BatchSkippedRow[];
  counts: { landed: number; unchanged: number; valid: number; invalid: number; failed: number; skipped: number };
}

/** The writer seams — real by default, faked in tests. */
export interface InboundBatchDeps {
  query: typeof tenantQuery;
  preview: typeof previewInboundOrder;
  ingest: typeof ingestInboundOrder;
  /** A landed RETURN line whose carton was already unboxed is received now. */
  receiveIfUnboxed: typeof receiveImportedLineIfCartonUnboxed;
}

const defaultBatchDeps: InboundBatchDeps = {
  query: tenantQuery,
  preview: previewInboundOrder,
  ingest: ingestInboundOrder,
  receiveIfUnboxed: receiveImportedLineIfCartonUnboxed,
};

/** The uploaded file, kept row by row with the batch (`inbound_import_row`) for the upload check. */
export interface InboundImportFile {
  name: string;
  preset: string;
  headers: string[];
  /** field → header, as used. */
  columnMap: Record<string, string>;
  /** Every data row, header → raw cell text. Order `rows` / skipped `row` index into it. */
  rows: ReadonlyArray<Record<string, string>>;
  /** Problems per file row (0-based) — the held rows' reasons, including rows that grouped into no order. */
  problemsByRow: ReadonlyMap<number, string[]>;
}

export interface InboundDraftBatchInput {
  orders: readonly BatchOrderDraft[];
  skipped: readonly BatchSkippedRow[];
  /** Input rows the orders came from. */
  total: number;
  /** Stable hash of the file — part of every order's ledger key. */
  fileHash: string;
  origin: Exclude<InboundOrderOrigin, 'manual'>;
  source: string;
  staffId: number | null;
  label?: string | null;
  /** The file itself; absent for a sync page (no rows are kept). */
  file?: InboundImportFile | null;
  dryRun: boolean;
}

interface ImportRowRecord {
  row_number: number;
  cells: Record<string, string>;
  order_key: string | null;
  line_key: string | null;
  status: ImportRowStatus;
  problem: string | null;
  inbound_order_id: number | null;
  receiving_line_id: number | null;
}

const ROW_STATUS: Record<BatchOrderOutcome['status'], ImportRowStatus> = {
  landed: 'landed',
  unchanged: 'unchanged',
  valid: 'landed',
  invalid: 'held',
  failed: 'failed',
};

/** One `inbound_import_row` per file data row, from the orders' outcomes. */
function importRowRecords(
  file: InboundImportFile,
  orders: readonly BatchOrderDraft[],
  outcomes: readonly BatchOrderOutcome[],
  landedLines: ReadonlyMap<number, IngestInboundOrderResult['lines']>,
  skipped: readonly BatchSkippedRow[],
): ImportRowRecord[] {
  const records: ImportRowRecord[] = file.rows.map((cells, i) => ({
    row_number: i + 1,
    cells,
    order_key: null,
    line_key: null,
    status: 'held',
    problem: file.problemsByRow.get(i)?.join('; ') ?? null,
    inbound_order_id: null,
    receiving_line_id: null,
  }));
  for (const s of skipped) {
    const record = records[s.row];
    if (record) record.problem ??= s.reason;
  }
  orders.forEach((order, o) => {
    const outcome = outcomes[o];
    const filled = filledInboundLines(order.draft);
    const keys = assignInboundLineKeys(filled);
    const lines = landedLines.get(o) ?? [];
    order.rows.forEach((fileRow, l) => {
      const record = records[fileRow];
      if (!record) return;
      const at = filled.indexOf(order.draft.lines[l]);
      const lineKey = at >= 0 ? keys[at] : null;
      record.order_key = order.draft.orderNumber;
      record.line_key = lineKey;
      record.status = ROW_STATUS[outcome.status];
      record.inbound_order_id = outcome.inboundOrderId ?? null;
      record.receiving_line_id = lines.find((line) => line.lineKey === lineKey)?.receivingLineId ?? null;
      if (record.status !== 'landed' && record.status !== 'unchanged') record.problem ??= outcome.error ?? null;
    });
  });
  return records;
}

/** Grouped orders → preview (dry run) or the one writer (commit). */
export async function runInboundDraftBatch(
  orgId: OrgId,
  input: InboundDraftBatchInput,
  deps: InboundBatchDeps = defaultBatchDeps,
): Promise<InboundImportBatchResult> {
  const { orders, skipped, file } = input;
  const landable = orders.filter((o) => !o.problems?.length).length;
  let batchId: number | null = null;
  if (!input.dryRun) {
    const batch = await deps.query<{ id: number }>(
      orgId,
      `INSERT INTO inbound_import_batch
         (organization_id, origin, source, label, status, total, created_by, file_name, preset, headers, column_map)
       VALUES ($1, $2, $3, $4, 'committing', $5, $6, $7, $8, $9::jsonb, $10::jsonb) RETURNING id`,
      [
        orgId,
        input.origin,
        input.source,
        input.label ?? null,
        landable,
        input.staffId,
        file?.name ?? null,
        file?.preset ?? null,
        file ? JSON.stringify(file.headers) : null,
        file ? JSON.stringify(file.columnMap) : null,
      ],
    );
    batchId = Number(batch.rows[0].id);
  }

  const outcomes: BatchOrderOutcome[] = [];
  /** Order index → the lines the writer landed it as. */
  const landedLines = new Map<number, IngestInboundOrderResult['lines']>();
  for (const [index, order] of orders.entries()) {
    const base = {
      orderNumber: order.draft.orderNumber,
      rows: order.rows,
      tier: order.draft.priority,
      lines: order.draft.lines.length,
    };
    if (order.problems?.length) {
      outcomes.push({ ...base, status: 'invalid', problems: order.problems, error: order.problems.join('; ') });
      continue;
    }
    if (input.dryRun) {
      try {
        const preview = await deps.preview(orgId, order.draft, { returnClaim: false });
        if (preview.missing.length) {
          const problems = preview.missing.map((m) => m.label);
          outcomes.push({ ...base, status: 'invalid', problems, error: problems.join('; ') });
        } else {
          outcomes.push({
            ...base,
            status: preview.unchanged ? 'unchanged' : 'valid',
            change: preview.existing ? (preview.unchanged ? 'unchanged' : 'updated') : 'new',
            inboundOrderId: preview.existing?.inboundOrderId,
            lines: preview.lines.length,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'invalid';
        outcomes.push({ ...base, status: 'invalid', problems: [message], error: message });
      }
      continue;
    }
    try {
      const result = await deps.ingest(orgId, order.draft, {
        origin: input.origin,
        source: input.source,
        staffId: input.staffId,
        batchId,
        sourceEventId: `${input.source}:${input.fileHash}:${normalizeInboundOrderNumber(order.draft.orderNumber)}:${order.draft.platform}`,
      });
      landedLines.set(index, result.lines);
      // The writer lands the return facts in its transaction; a line whose carton was unboxed before the report arrived is received now.
      if (order.draft.type === 'RETURN' && !result.unchanged) {
        for (const line of result.lines) await deps.receiveIfUnboxed(orgId, line.receivingLineId);
      }
      outcomes.push({
        ...base,
        status: result.unchanged ? 'unchanged' : 'landed',
        change: result.unchanged ? 'unchanged' : result.created ? 'new' : 'updated',
        created: result.created,
        inboundOrderId: result.inboundOrderId,
        lines: result.lines.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'import failed';
      outcomes.push({
        ...base,
        status: err instanceof InboundOrderRefused ? 'invalid' : 'failed',
        problems: [message],
        error: message,
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
  if (batchId != null) {
    if (file && file.rows.length > 0) {
      await deps.query(
        orgId,
        `INSERT INTO inbound_import_row
           (organization_id, batch_id, row_number, cells, order_key, line_key, status, problem, inbound_order_id, receiving_line_id)
         SELECT $1, $2, r.row_number, r.cells, r.order_key, r.line_key, r.status, r.problem, r.inbound_order_id, r.receiving_line_id
           FROM jsonb_to_recordset($3::jsonb) AS r(
             row_number int, cells jsonb, order_key text, line_key text, status text, problem text,
             inbound_order_id bigint, receiving_line_id int)`,
        [orgId, batchId, JSON.stringify(importRowRecords(file, orders, outcomes, landedLines, skipped))],
      );
    }
    await deps.query(
      orgId,
      `UPDATE inbound_import_batch
          SET status = $2, valid = $3, landed = $4, failed = $5,
              committed_at = CASE WHEN $2 = 'committed' THEN now() END, updated_at = now()
        WHERE organization_id = $1 AND id = $6`,
      [
        orgId,
        counts.failed + counts.invalid > 0 && counts.landed + counts.unchanged === 0 ? 'failed' : 'committed',
        counts.valid + counts.landed + counts.unchanged,
        counts.landed,
        counts.failed + counts.invalid,
        batchId,
      ],
    );
  }

  return { batchId, dryRun: input.dryRun, total: input.total, orders: outcomes, skipped: [...skipped], counts };
}

/** Stable hash of an uploaded file's rows — the ledger's re-post key. */
export function inboundFileHash(rows: unknown): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 24);
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
