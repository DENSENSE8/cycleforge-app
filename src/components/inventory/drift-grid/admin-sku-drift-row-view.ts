/**
 * `SkuDriftRow → CompoundRowView` — the SKU stock-drift adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `admin-sku-drift-resolve.ts`.
 *
 * ## What the compound row says about one drifting SKU
 *
 * - IDS — the SKU. It is the row's whole identity: `v_sku_stock_drift` is a
 *   read-time join with no id of its own.
 * - TITLE — the WAREHOUSE delta, in words. The retired cell painted
 *   `+2` / `-2` in red and `0` in grey; the direction is expressed through the
 *   VALUE ("Warehouse +2", "Warehouse in sync") rather than through a colour,
 *   because the sign is the fact and the paint was not.
 * - STATE — the BOXED delta, the same way. Two symmetric dimensions, and the
 *   compound row has exactly one title and one pill, so the primary dimension
 *   (the one `fn_reconcile_sku_stock` replays, and the one the retired table
 *   put first) takes the title and the second takes the pill.
 * - DATES — nothing. The view carries no stamp, so both lines stay null and the
 *   shared cell paints the honest empty face. The track's header is blanked in
 *   `admin-sku-drift-grid-layout.ts`; see that module for the ruling.
 *
 * The four stored/ledger counters are BOUND tracks, not lines of this view: an
 * adapter that also painted them under the title would print each one twice.
 */

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

/**
 * One dimension's drift as a WORD — the direction spelled into the value.
 *
 * `+2` reads as "stored counts two more than the ledger can account for" and
 * `-2` as the reverse; `in sync` says the dimension reconciles, which is a real
 * answer for a row that is on this desk because the OTHER dimension drifted. A
 * bare `0` would read as missing data beside a red `-2`.
 */
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
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
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
