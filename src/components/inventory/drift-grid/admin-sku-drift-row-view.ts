/** `SkuDriftRow → CompoundRowView` — the SKU stock-drift adapter. */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { SkuDriftRow } from '@/lib/inventory/drift-rows';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/** A counter disagrees with its ledger — a writer bypassed the ledger. */
const DRIFTING_TONE: CompoundStateTone = 'alert';

/** This dimension reconciles; only the other one is out. */
const IN_SYNC_TONE: CompoundStateTone = 'done';

/** One dimension's drift as a WORD — the direction spelled into the value. */
function driftFace(dimension: string, drift: number): string {
  if (drift === 0) return `${dimension} in sync`;
  return `${dimension} ${drift > 0 ? '+' : ''}${drift}`;
}

export function adminSkuDriftCompoundView(row: SkuDriftRow): CompoundRowView {
  const sku = String(row.sku ?? '').trim() || null;

  return {
    id: sku ?? '',
    thumbUrl: null,
    title: driftFace('Warehouse', row.warehouse_drift),
    // The counters behind the deltas are their own tracks; a fallback note
    // would repeat them under the title.
    note: null,
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(sku, 'SKU'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind a stock counter: the identity chip
    // must not borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: driftFace('Boxed', row.boxed_drift),
    // Tone is an accelerator on a word that already says it, never the fact.
    stateTone: row.boxed_drift === 0 ? IN_SYNC_TONE : DRIFTING_TONE,
    // The view is a read-time comparison: there is no instant behind a row, so
    // both DATES lines stay empty rather than borrowing the request time.
    orderedAt: null,
    delay: null,
    amount: null,
  };
}
