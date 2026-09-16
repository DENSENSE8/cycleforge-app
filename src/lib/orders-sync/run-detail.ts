/**
 * The run's PER-ROW record — "39 inserted, 21 need a fix" turned into the rows
 * themselves.
 *
 * The ledger ({@link run-steps}) answers *how far along, how many*. It cannot
 * answer *which ones*, and an operator who reads "21 need a fix" has exactly
 * one next question. Before this existed, that answer lived only in the
 * sidebar's `OrderSyncDialog` — a right-rail panel on a route the desk no
 * longer opened, not a phone surface at all, and deleted 2026-09-15.
 *
 * Pure: takes the per-provider tab state the sync hook already holds and
 * returns groups ready to paint. No React, no fetch, so it is unit-testable and
 * both surfaces render the same answer.
 */
import type {
  TransferSkippedRow,
  TransferOrderDetail,
  TransferTabState,
} from './types';
import {
  SKIP_REASON_META,
  SKIP_REASON_ORDER,
} from './skip-reasons';

/** Review · Missing item number — the durable queue for blank Item Number rows. */
export const MISSING_ITEM_NUMBER_HREF =
  '/review?mode=catalog-link&section=missing-item-number';

export interface SyncRunDetailRow {
  key: string;
  orderId: string;
  title: string;
  tracking?: string;
  platform?: string;
  /** Which provider lane produced it — the operator's "where did this come from". */
  source: string;
  /** Spreadsheet row, for a skip the operator has to go edit. */
  sheetRow?: number;
}

export type SyncRunDetailTone = 'success' | 'info' | 'warning' | 'quiet';

export interface SyncRunDetailGroup {
  id: string;
  label: string;
  /** Why this group exists / what to do about it. */
  hint?: string;
  tone: SyncRunDetailTone;
  /** True when a human has to go change something. Sorts first. */
  actionable: boolean;
  rows: SyncRunDetailRow[];
  /** Rows in the group that are counted but deliberately not listed. */
  unlistedCount?: number;
  /** Deep link for the group's fix, when one exists. */
  href?: string;
}

export interface SyncRunDetail {
  groups: SyncRunDetailGroup[];
  /** Every row this detail describes — the sheet's own badge count. */
  total: number;
  hasActionable: boolean;
}

/** Meaning of a skip lives in one leaf module; this file only groups. */

function orderRow(row: TransferOrderDetail, source: string, index: number): SyncRunDetailRow {
  return {
    key: `${source}:${row.orderId || 'row'}:${index}`,
    orderId: row.orderId,
    title: row.productTitle,
    tracking: row.tracking || undefined,
    source,
    platform: row.existingAccountSource ?? undefined,
  };
}

function skipRow(row: TransferSkippedRow, index: number): SyncRunDetailRow {
  return {
    key: `skip:${row.reason}:${row.sheetRow || index}`,
    orderId: row.orderId,
    title: row.productTitle,
    tracking: row.tracking || undefined,
    platform: row.platform || undefined,
    source: 'Google Sheet',
    sheetRow: row.sheetRow || undefined,
  };
}

/**
 * Fold the per-provider tab state into paintable groups.
 *
 * Actionable groups sort first — on a live sheet the skip list is routinely the
 * largest group, and it is the only one with work attached.
 */
export function buildSyncRunDetail(tabs: {
  sheets?: TransferTabState | null;
  ecwid?: TransferTabState | null;
}): SyncRunDetail {
  const lanes: Array<{ source: string; tab: TransferTabState | null | undefined }> = [
    { source: 'Google Sheet', tab: tabs.sheets },
    { source: 'Ecwid', tab: tabs.ecwid },
  ];

  const inserted: SyncRunDetailRow[] = [];
  const updated: SyncRunDetailRow[] = [];
  const unmatched: SyncRunDetailRow[] = [];
  const skipped: TransferSkippedRow[] = [];

  for (const { source, tab } of lanes) {
    const details = tab?.details;
    if (!details) continue;
    details.inserted.forEach((row, i) => inserted.push(orderRow(row, source, i)));
    details.updated.forEach((row, i) => updated.push(orderRow(row, source, i)));
    details.unmatchedCatalog.forEach((row, i) => unmatched.push(orderRow(row, source, i)));
    for (const row of details.skippedRows ?? []) skipped.push(row);
  }

  const groups: SyncRunDetailGroup[] = [];

  for (const reason of SKIP_REASON_ORDER) {
    const rows = skipped.filter((row) => row.reason === reason);
    if (rows.length === 0) continue;
    const meta = SKIP_REASON_META[reason];
    groups.push({
      id: `skip-${reason}`,
      label: meta.label,
      hint: meta.hint,
      tone: meta.tone,
      actionable: meta.actionable,
      rows: meta.listed ? rows.map(skipRow) : [],
      unlistedCount: meta.listed ? undefined : rows.length,
      href: reason === 'noItemNumber' ? MISSING_ITEM_NUMBER_HREF : undefined,
    });
  }

  if (unmatched.length > 0) {
    groups.push({
      id: 'unmatched-catalog',
      label: 'Imported, but no catalog match',
      hint: 'These landed in the queue with an item number that resolves to nothing in the catalog.',
      tone: 'warning',
      actionable: true,
      rows: unmatched,
    });
  }

  if (inserted.length > 0) {
    groups.push({
      id: 'inserted',
      label: 'New orders',
      tone: 'success',
      actionable: false,
      rows: inserted,
    });
  }

  if (updated.length > 0) {
    groups.push({
      id: 'updated',
      label: 'Updated orders',
      tone: 'info',
      actionable: false,
      rows: updated,
    });
  }

  groups.sort((a, b) => Number(b.actionable) - Number(a.actionable));

  const total = groups.reduce(
    (sum, group) => sum + (group.unlistedCount ?? group.rows.length),
    0,
  );

  return { groups, total, hasActionable: groups.some((group) => group.actionable) };
}
