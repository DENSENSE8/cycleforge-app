/**
 * Purchase-order CSV import — what the operator reviews (client + server safe).
 *
 * The dry run (`runPoCsvImport`) answers per order: status, change, rows,
 * problems. The review needs more than that to show each order as a card —
 * its date, its product titles, its total — so the client re-reads the file
 * rows the server grouped (`BatchOrderOutcome.rows`) through the same row
 * mapper the server used (`poRowToDeskRow`). No second grouping, no second
 * validation: status and problems always come from the server answer.
 *
 * Also owns the "Match columns" step's just-in-time rule: which columns need
 * the operator's look (unmatched, or bound by a weak value-shape guess).
 */

import type { BatchOrderOutcome } from './import-batch';
import {
  poPresetForPlatform,
  poRowToDeskRow,
  type PoColumnIdentification,
  type PoField,
  type PoIdentifiedColumn,
  type PoRowProblem,
} from './po-columns';

/** Below this the binding is a value-shape guess the detector itself rates weak — the operator checks it. */
export const PO_COLUMN_SURE = 0.7;

export type PoReviewStatus = 'needs_fix' | 'failed' | 'new' | 'updated' | 'unchanged';

/** Review order of the groups — what needs the operator first. */
export const PO_REVIEW_STATUS_ORDER: readonly PoReviewStatus[] = ['needs_fix', 'failed', 'new', 'updated', 'unchanged'];

export interface PoReviewLine {
  /** 0-based file data row. */
  row: number;
  itemNumber: string | null;
  /** Item title, else SKU; null when the row has neither. */
  title: string | null;
  sku: string | null;
  quantity: number | null;
  unitCostCents: number | null;
  tracking: string | null;
  /** YYYY-MM-DD, when the row's order date parsed. */
  orderDate: string | null;
  problems: PoRowProblem[];
}

export interface PoReviewOrder {
  key: string;
  orderNumber: string;
  status: PoReviewStatus;
  /** YYYY-MM-DD of the first line that carries one. */
  orderDate: string | null;
  lines: PoReviewLine[];
  /** Units across lines (quantity; a line with no quantity counts once). */
  units: number;
  /** Sum of unit cost × quantity over costed lines; null when no line is costed. */
  totalCents: number | null;
  /** Problems that name no file row (e.g. too many lines, a writer failure). */
  orderProblems: string[];
}

export interface PoReviewGroup {
  status: PoReviewStatus;
  orders: PoReviewOrder[];
}

export interface PoReviewInput {
  rows: ReadonlyArray<Record<string, string>>;
  mapping: Partial<Record<PoField, string>>;
  platform: string;
  outcomes: readonly BatchOrderOutcome[];
  rowProblems: readonly PoRowProblem[];
}

export function poReviewStatus(outcome: Pick<BatchOrderOutcome, 'status' | 'change'>): PoReviewStatus {
  if (outcome.status === 'invalid') return 'needs_fix';
  if (outcome.status === 'failed') return 'failed';
  if (outcome.status === 'unchanged') return 'unchanged';
  return outcome.change ?? 'new';
}

function reviewLine(input: Omit<PoReviewInput, 'outcomes'>, row: number): PoReviewLine {
  const raw = input.rows[row] ?? {};
  const { deskRow } = poRowToDeskRow(raw, row, { mapping: input.mapping, preset: poPresetForPlatform(input.platform), platform: input.platform });
  const cell = (field: PoField) => {
    const header = input.mapping[field];
    const value = header ? (raw[header] ?? '').trim() : '';
    return value || null;
  };
  return {
    row,
    itemNumber: deskRow?.itemNumber ?? cell('item_id'),
    title: deskRow ? (deskRow.itemName ?? deskRow.sku ?? null) : (cell('item_title') ?? cell('sku')),
    sku: deskRow?.sku ?? cell('sku'),
    quantity: deskRow?.quantity ?? null,
    unitCostCents: deskRow?.unitCostCents ?? null,
    tracking: deskRow?.trackingNumber ?? null,
    orderDate: deskRow?.orderDate ?? null,
    problems: input.rowProblems.filter((p) => p.row === row),
  };
}

/** One card model per order the server grouped, in file order. */
export function poReviewOrders(input: PoReviewInput): PoReviewOrder[] {
  return input.outcomes.map((outcome) => {
    const lines = outcome.rows.map((row) => reviewLine(input, row));
    const costed = lines.filter((l) => l.unitCostCents != null);
    const rowless = (outcome.problems ?? []).filter((p) => !/^Row \d+:/.test(p));
    if (outcome.status === 'failed' && outcome.error && !rowless.includes(outcome.error)) rowless.push(outcome.error);
    return {
      key: `${outcome.orderNumber}:${outcome.rows[0] ?? 0}`,
      orderNumber: outcome.orderNumber,
      status: poReviewStatus(outcome),
      orderDate: lines.find((l) => l.orderDate)?.orderDate ?? null,
      lines,
      units: lines.reduce((sum, l) => sum + (l.quantity ?? 1), 0),
      totalCents: costed.length ? costed.reduce((sum, l) => sum + (l.unitCostCents ?? 0) * (l.quantity ?? 1), 0) : null,
      orderProblems: rowless,
    };
  });
}

/** File rows with no order number — reported on their own, never dropped. */
export function poOrphanLines(input: Omit<PoReviewInput, 'outcomes'>): PoReviewLine[] {
  const rows = [...new Set(input.rowProblems.filter((p) => p.field === 'order_number').map((p) => p.row))];
  return rows.map((row) => reviewLine(input, row));
}

/** Orders grouped by status, groups in {@link PO_REVIEW_STATUS_ORDER}, empty groups left out. */
export function groupPoReviewOrders(orders: readonly PoReviewOrder[]): PoReviewGroup[] {
  return PO_REVIEW_STATUS_ORDER.map((status) => ({ status, orders: orders.filter((o) => o.status === status) })).filter(
    (g) => g.orders.length > 0,
  );
}

/** Columns the operator should look at: not matched, or matched by a weak guess — unless already checked. */
export function poColumnsNeedingLook(identification: PoColumnIdentification, checked: ReadonlySet<string>): PoIdentifiedColumn[] {
  return identification.columns.filter(
    (col) => !checked.has(col.header) && col.reason !== 'operator' && (col.field == null || col.confidence < PO_COLUMN_SURE),
  );
}

/**
 * The mapping after the operator binds `header` to `field` ('' = leave the
 * column out): the header leaves any field it held, and the field leaves any
 * other header — one column per field, one field per column.
 */
export function poRemapColumn(mapping: Partial<Record<PoField, string>>, header: string, field: PoField | ''): Partial<Record<PoField, string>> {
  const next: Partial<Record<PoField, string>> = {};
  for (const [f, h] of Object.entries(mapping) as Array<[PoField, string | undefined]>) if (h && h !== header && f !== field) next[f] = h;
  if (field) next[field] = header;
  return next;
}
