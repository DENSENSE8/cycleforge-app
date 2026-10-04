/**
 * Bulk purchase-order CSV → the one inbound writer (server).
 *
 *   identify columns (`po-columns`) → each row → desk row (+ its problems) →
 *   `draftsFromDeskRows` groups orders → `inboundOrderMissing` checks every
 *   order → `runInboundDraftBatch` previews (dry run, writes nothing) or lands
 *   each clean order through `ingestInboundOrder`.
 *
 * An order with any problem row is held whole and reported with the exact
 * field per row; a row with no order number is reported on its own. Nothing
 * is dropped silently. The AI header mapping runs only when the caller asks
 * (`assist`) AND required fields are still unmapped after header + value
 * shape.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { proposeColumnMapping } from '@/lib/orders/ai-column-mapping';
import { inboundOrderMissing, type InboundOrderField } from './inbound-order-draft';
import { draftsFromDeskRows, inboundFileHash, runInboundDraftBatch, type BatchOrderDraft, type InboundBatchDeps, type InboundImportBatchResult } from './import-batch';
import type { DeskImportRow } from './desk-csv';
import {
  PO_COLUMNS,
  PO_FIELDS,
  identifyColumns,
  poPresetForPlatform,
  poRowToDeskRow,
  withPoMapping,
  type PoColumnIdentification,
  type PoField,
  type PoPresetId,
  type PoRowProblem,
} from './po-columns';

/** Lines one inbound order may carry (`inboundOrderDraftSchema`). */
const MAX_ORDER_LINES = 200;

const FIELD_FOR_NEED: Record<InboundOrderField, PoField> = {
  platform: 'platform',
  zoho_source: 'platform',
  order_number: 'order_number',
  lines: 'item_title',
  line_identity: 'item_title',
  quantity: 'quantity',
  pickup_date: 'order_date',
  tracking: 'tracking',
  return_item: 'sku',
  return_reason: 'notes',
  listing_url: 'listing_url',
};

export interface PoCsvImportInput {
  headers: string[];
  rows: Record<string, string>[];
  /** Platform pick; its preset (Goodwill / generic) supplies the defaults. */
  platform: string;
  /** Operator's column picks (field → header); absent = identified. */
  mapping?: Partial<Record<PoField, string>> | null;
  /** Ask the AI for headers when required fields stay unmapped. Dry run only. */
  assist?: boolean;
  dryRun: boolean;
  staffId: number | null;
  label?: string | null;
}

export interface PoCsvOrderSummary {
  orders: number;
  new: number;
  updated: number;
  unchanged: number;
  needsFix: number;
  landed: number;
  failed: number;
}

export interface PoCsvImportResult {
  platform: string;
  preset: PoPresetId;
  identification: PoColumnIdentification;
  /** AI fallback outcome, when it ran. */
  assist: { ran: boolean; model?: string; rejected?: string[]; error?: string } | null;
  /** Every problem row (with or without an order), exact field each. */
  rowProblems: PoRowProblem[];
  /** Null when required columns are still unmapped — nothing could be grouped. */
  batch: InboundImportBatchResult | null;
  summary: PoCsvOrderSummary;
}

export interface PoCsvImportDeps {
  batch?: InboundBatchDeps;
  propose?: typeof proposeColumnMapping<PoField>;
}

function summarize(batch: InboundImportBatchResult | null): PoCsvOrderSummary {
  const orders = batch?.orders ?? [];
  return {
    orders: orders.length,
    new: orders.filter((o) => o.change === 'new').length,
    updated: orders.filter((o) => o.change === 'updated').length,
    unchanged: orders.filter((o) => o.change === 'unchanged').length,
    needsFix: orders.filter((o) => o.status === 'invalid').length,
    landed: orders.filter((o) => o.status === 'landed').length,
    failed: orders.filter((o) => o.status === 'failed').length,
  };
}

export async function runPoCsvImport(
  orgId: OrgId,
  input: PoCsvImportInput,
  deps: PoCsvImportDeps = {},
): Promise<PoCsvImportResult> {
  const platform = input.platform.trim().toLowerCase();
  const preset = poPresetForPlatform(platform);
  const presetPlatform = platform || preset.platform;
  let identification = identifyColumns(input.headers, input.rows, { preset, platform: presetPlatform });
  if (input.mapping) {
    identification = withPoMapping(identification, input.mapping, { preset, platform: presetPlatform });
  }

  let assist: PoCsvImportResult['assist'] = null;
  if (input.assist && input.dryRun && identification.missingRequired.length > 0) {
    try {
      const proposal = await (deps.propose ?? proposeColumnMapping<PoField>)(orgId, {
        headers: input.headers,
        sampleRows: input.rows.slice(0, 5),
        deterministicMapping: identification.mapping,
        fields: PO_FIELDS.map((key) => ({ key, label: PO_COLUMNS[key].label, required: PO_COLUMNS[key].required !== false })),
      });
      const mapping = { ...identification.mapping };
      const detail: Partial<Record<PoField, { note: string; confidence: number }>> = {};
      for (const s of proposal.suggestions) {
        mapping[s.field] = s.header;
        detail[s.field] = { note: s.reason, confidence: s.confidence === 'high' ? 0.8 : s.confidence === 'medium' ? 0.6 : 0.4 };
      }
      identification = withPoMapping(identification, mapping, { preset, platform: presetPlatform, reason: 'ai', detail });
      assist = { ran: true, model: proposal.model, rejected: proposal.rejectedHallucinations };
    } catch (err) {
      assist = { ran: false, error: err instanceof Error ? err.message : 'AI mapping unavailable' };
    }
  }

  if (identification.missingRequired.length > 0) {
    return { platform: presetPlatform, preset: preset.id, identification, assist, rowProblems: [], batch: null, summary: summarize(null) };
  }

  const rowProblems: PoRowProblem[] = [];
  const deskRows: DeskImportRow[] = [];
  const fileRowOf: number[] = [];
  input.rows.forEach((row, index) => {
    const { deskRow, problems } = poRowToDeskRow(row, index, { mapping: identification.mapping, preset, platform: presetPlatform });
    rowProblems.push(...problems);
    if (deskRow) {
      deskRows.push(deskRow);
      fileRowOf.push(index);
    }
  });

  const grouped = await draftsFromDeskRows(orgId, deskRows);
  const orders: BatchOrderDraft[] = grouped.orders.map((order) => {
    const rows = order.rows.map((i) => fileRowOf[i]);
    const flagged = (row: number, field: PoField) => rowProblems.some((p) => p.row === row && p.field === field);
    // The draft contract's own checklist — line needs point back at file rows.
    for (const need of inboundOrderMissing(order.draft, { returnClaim: false })) {
      const field = FIELD_FOR_NEED[need.field];
      for (const row of need.lines ? need.lines.map((l) => rows[l]) : rows) {
        if (!flagged(row, field)) rowProblems.push({ row, field, message: need.label });
      }
    }
    const problems = rowProblems
      .filter((p) => rows.includes(p.row))
      .map((p) => `Row ${p.row + 2}: ${p.message}`);
    if (order.draft.lines.length > MAX_ORDER_LINES) problems.push(`More than ${MAX_ORDER_LINES} lines on one order`);
    return { rows, draft: order.draft, problems: [...new Set(problems)] };
  });
  rowProblems.sort((a, b) => a.row - b.row);

  const batch = await runInboundDraftBatch(
    orgId,
    {
      orders,
      skipped: grouped.skipped.map((s) => ({ row: fileRowOf[s.row], reason: s.reason })),
      total: input.rows.length,
      fileHash: inboundFileHash({ platform: presetPlatform, mapping: identification.mapping, rows: input.rows }),
      origin: 'csv',
      source: 'po-csv',
      staffId: input.staffId,
      label: input.label ?? null,
      dryRun: input.dryRun,
    },
    deps.batch,
  );

  return { platform: presetPlatform, preset: preset.id, identification, assist, rowProblems, batch, summary: summarize(batch) };
}
