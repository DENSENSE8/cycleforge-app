/**
 * Labels & docs — the desk's rows and the card model (layer 2 of the triage
 * family contract), for all three print-job views:
 *
 *   Labels     one row per stored label not yet printed        (4×6, label station)
 *   Paperwork  one row per order with slips / manuals to print (letter, paper station)
 *   Printed    both, newest print first
 *
 * ONE card per order: every row that ships or files one order rides the same
 * card (two boxes, a label AND its paperwork in Printed), so the order number
 * is never repeated. The card reads what the order IS — platform + order
 * number on top, its products with quantities beneath. A label with no order
 * is its own card, named by its tracking number.
 */

import type { RowGroup } from '@/lib/group-rows';
import { ledgerStatus, quarantineCopy } from '@/lib/label-ingestions/ledger-view';
import type { LabelOrderLine, LabelPrintQueue, LabelPrintRow, PaperworkPrintRow } from '@/lib/label-prints/contracts';
import { labelPdfSrc } from '@/lib/label-prints/http-client';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import type { LabelPairingKey } from '@/lib/triage/views/label-intake';

/**
 * One desk row. `id` is the triage row id (the face keys rows by number): a
 * label's ingestion id, or a paperwork order's NEGATED order id — ingestion
 * ids are positive, so the two never collide.
 */
export interface DeskRow {
  id: number;
  label: LabelPrintRow | null;
  paperwork: PaperworkPrintRow | null;
  orderId: number | null;
  orderRef: string | null;
  accountSource: string | null;
  lines: LabelOrderLine[];
  lastPrintedAt: string | null;
}

export function labelDeskRow(row: LabelPrintRow): DeskRow {
  return {
    id: row.id,
    label: row,
    paperwork: null,
    orderId: row.orderId,
    orderRef: row.orderId != null ? row.orderRef : null,
    accountSource: row.orderAccountSource,
    lines: row.orderLines,
    lastPrintedAt: row.lastPrintedAt,
  };
}

export function paperworkDeskRow(row: PaperworkPrintRow): DeskRow {
  return {
    id: -row.orderId,
    label: null,
    paperwork: row,
    orderId: row.orderId,
    orderRef: row.orderRef,
    accountSource: row.orderAccountSource,
    lines: row.orderLines,
    lastPrintedAt: row.lastPrintedAt,
  };
}

const newestPrintFirst = (a: DeskRow, b: DeskRow) => (b.lastPrintedAt ?? '').localeCompare(a.lastPrintedAt ?? '');

/** A queue read → desk rows in the view's order (Printed interleaves both logs, newest print first). */
export function deskRows(queue: LabelPrintQueue | undefined): DeskRow[] {
  if (!queue) return [];
  if (queue.view === 'labels') return queue.rows.map(labelDeskRow);
  if (queue.view === 'paperwork') return queue.rows.map(paperworkDeskRow);
  return [...queue.labels.map(labelDeskRow), ...queue.paperwork.map(paperworkDeskRow)].sort(newestPrintFirst);
}

// ── Find + the pairing cut ─────────────────────────────────────────────────

const compact = (value: string) => value.toLowerCase().replace(/[\s-]+/g, '');

/** A row's pairing chip: on an order, or not. */
export function deskPairingKey(row: DeskRow): LabelPairingKey {
  return row.orderId != null ? 'paired' : 'unpaired';
}

/**
 * Rows whose order number, tracking, label file, carrier or document title
 * contains `query` — spaces and dashes ignored, so a tracking number typed in
 * groups still matches.
 */
export function findDeskRows(rows: readonly DeskRow[], query: string): DeskRow[] {
  const needle = compact(query);
  if (!needle) return [...rows];
  return rows.filter((row) =>
    [
      row.orderRef,
      row.label?.trackingNumber,
      row.label?.fileBasename,
      row.label?.carrier,
      ...(row.paperwork?.documents.map((doc) => doc.title) ?? []),
    ].some((field) => field != null && compact(field).includes(needle)),
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────

export interface DeskCardModel {
  key: string;
  /** Every row on the card — select and print take them all. */
  ids: number[];
  /** The row the card opens (its first). */
  lead: DeskRow;
  rows: DeskRow[];
  labels: LabelPrintRow[];
  paperwork: PaperworkPrintRow[];
  /** The order number, or null for an unpaired label. */
  orderRef: string | null;
  accountSource: string | null;
  lines: LabelOrderLine[];
  /** The quarantine / failure sentence when a label on the card needs a person; else null. */
  problem: string | null;
}

/** The card a row belongs to: its order, else the label itself. */
export function deskCardKeyOf(row: DeskRow): string {
  if (row.orderRef) return `order:${row.orderRef}`;
  return row.label ? `label:${row.label.id}` : `order-id:${row.orderId}`;
}

export const deskCardKey = (group: RowGroup<DeskRow>): string => group.key;

/** Rows → one card per order, in the queue's order (the first row seen places the card). */
export function deskBands(rows: readonly DeskRow[]): [string, RowGroup<DeskRow>[]][] {
  const groups = new Map<string, DeskRow[]>();
  for (const row of rows) {
    const key = deskCardKeyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [['desk', [...groups].map(([key, members]) => ({ key, rows: members }))]];
}

export function deskCardModel(group: RowGroup<DeskRow>): DeskCardModel {
  const rows = group.rows;
  const lead = rows[0]!;
  const labels = rows.flatMap((row) => (row.label ? [row.label] : []));
  const stuck = labels.find((row) => ledgerStatus(row.state).action === 'retry') ?? null;
  return {
    key: group.key,
    ids: rows.map((row) => row.id),
    lead,
    rows,
    labels,
    paperwork: rows.flatMap((row) => (row.paperwork ? [row.paperwork] : [])),
    orderRef: lead.orderRef,
    accountSource: rows.find((row) => row.accountSource)?.accountSource ?? null,
    lines: rows.find((row) => row.lines.length > 0)?.lines ?? [],
    problem: stuck
      ? (quarantineCopy(stuck.quarantineReasonCode, stuck.trackingNumber != null) ?? ledgerStatus(stuck.state).label)
      : null,
  };
}

/** A Find naming exactly one card — its order number or a label's full tracking — opens it. */
export function deskExactFind(query: string, model: DeskCardModel): boolean {
  return (model.orderRef ?? '').toLowerCase() === query || model.labels.some((row) => (row.trackingNumber ?? '').toLowerCase() === query);
}

// ── Documents ──────────────────────────────────────────────────────────────

/** A label's chip title: the carrier, and — when the order ships several — which box (tracking, last 4). */
function labelTitle(row: LabelPrintRow, several: boolean): string {
  const base = row.carrier ? `${row.carrier} label` : 'Shipping label';
  return several && row.trackingNumber ? `${base} ·${row.trackingNumber.slice(-4)}` : base;
}

export function labelDocuments(labels: readonly LabelPrintRow[]): DeskDocument[] {
  const several = labels.length > 1;
  return labels.map((row) => ({
    key: `label:${row.id}`,
    kind: 'label',
    title: labelTitle(row, several),
    src: labelPdfSrc(row.id),
    stock: 'label',
    ingestionId: row.id,
    orderId: row.orderId,
    documentId: null,
    manualId: null,
  }));
}

/** An order's paperwork as printable documents; Drive-only manuals (no bytes) come back as `unprintable`. */
export function paperworkDocuments(rows: readonly PaperworkPrintRow[]): {
  documents: DeskDocument[];
  unprintable: Array<{ key: string; title: string }>;
} {
  const documents: DeskDocument[] = [];
  const unprintable: Array<{ key: string; title: string }> = [];
  for (const row of rows) {
    for (const doc of row.documents) {
      if (!doc.src) {
        unprintable.push({ key: doc.key, title: doc.title });
        continue;
      }
      documents.push({
        key: doc.key,
        kind: doc.kind,
        title: doc.title,
        src: doc.src,
        stock: 'paper',
        ingestionId: null,
        orderId: row.orderId,
        documentId: doc.documentId,
        manualId: doc.manualId,
      });
    }
  }
  return { documents, unprintable };
}

/** Paperwork documents never printed — what a Paperwork press takes by default. */
export function unprintedPaperworkKeys(rows: readonly PaperworkPrintRow[]): Set<string> {
  return new Set(rows.flatMap((row) => row.documents.filter((doc) => doc.src && doc.printCount === 0).map((doc) => doc.key)));
}
