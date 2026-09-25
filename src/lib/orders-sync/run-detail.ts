/**
 * The run's PER-ROW record — "39 inserted, 1 needs a fix" turned into the rows
 * themselves.
 *
 * The ledger ({@link run-steps}) answers *how far along, how many*. It cannot
 * answer *which ones*, and an operator who reads "1 needs a fix" has exactly
 * one next question. Before this existed, that answer lived only in the
 * sidebar's `OrderSyncDialog` — a right-rail panel on a route the desk no
 * longer opened, not a phone surface at all, and deleted 2026-09-15.
 *
 * Pure: takes the ShipStation task state the sync hook already holds and
 * returns groups ready to paint. No React, no fetch, so it is unit-testable and
 * both surfaces render the same answer.
 */
import type { TransferOrderDetail, TransferTabState } from './types';

export interface SyncRunDetailRow {
  key: string;
  orderId: string;
  title: string;
  tracking?: string;
  platform?: string;
  /** The import that produced it — painted when the row names no channel. */
  source: string;
}

export type SyncRunDetailTone = 'success' | 'info' | 'warning';

export interface SyncRunDetailGroup {
  id: string;
  label: string;
  /** Why this group exists / what to do about it. */
  hint?: string;
  tone: SyncRunDetailTone;
  /** True when a human has to go change something. Sorts first. */
  actionable: boolean;
  rows: SyncRunDetailRow[];
}

export interface SyncRunDetail {
  groups: SyncRunDetailGroup[];
  /** Every row this detail describes — the sheet's own badge count. */
  total: number;
  hasActionable: boolean;
}

/** The one order source a run reads. */
const SOURCE = 'ShipStation';

function orderRow(row: TransferOrderDetail, index: number): SyncRunDetailRow {
  return {
    key: `${row.orderId || 'row'}:${index}`,
    orderId: row.orderId,
    title: row.productTitle,
    tracking: row.tracking || undefined,
    source: SOURCE,
    platform: row.platform ?? row.existingAccountSource ?? undefined,
  };
}

/**
 * Fold the ShipStation task state into paintable groups.
 *
 * Actionable groups sort first — they are the only ones with work attached.
 */
export function buildSyncRunDetail(tab: TransferTabState | null | undefined): SyncRunDetail {
  const details = tab?.details;
  const inserted = (details?.inserted ?? []).map(orderRow);
  const updated = (details?.updated ?? []).map(orderRow);
  const unmatched = (details?.unmatchedCatalog ?? []).map(orderRow);
  const quarantined = (details?.quarantined ?? []).map(orderRow);

  const groups: SyncRunDetailGroup[] = [];

  if (quarantined.length > 0) {
    groups.push({
      id: 'quarantined',
      label: 'Held for review',
      hint: 'Not imported: the store has no platform, or the order number already sits under several platforms. They wait in Review · Missing item number and import on the next sync once fixed.',
      tone: 'warning',
      actionable: true,
      rows: quarantined,
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

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return { groups, total, hasActionable: groups.some((group) => group.actionable) };
}
