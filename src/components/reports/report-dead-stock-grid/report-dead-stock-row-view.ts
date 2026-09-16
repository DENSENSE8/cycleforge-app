/**
 * `DeadStockReportRow → CompoundRowView` — the dead-stock adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `report-dead-stock-resolve.ts`.
 *
 * ## What the compound row says about one dormant SKU
 *
 * - TITLE — the PRODUCT, linked to its catalog page (the engine's title href,
 *   never JSX inside a family cell). A row with no product title is named by
 *   the SKU it definitely has.
 * - IDS — the SKU. No tracking line: a dead-stock row has no carrier, and
 *   inventing one would paint a chip over a fact this feed does not have.
 * - STATE — HOW LONG it has been still. The word carries the `d` suffix; the
 *   FACT behind the header is the bare count, so the column sorts numerically
 *   and the search box matches what an operator types.
 * - DATES — WHEN it last moved, on the Hash line: the instant the count above
 *   is measured from. Leaving it null would paint a column of `--` under a
 *   live header.
 *
 * The retired `text-rose-600` on Days dormant is gone: the number is the fact
 * and the hue was decoration. Tone on this desk would have to mean "needs a
 * human", and every row on a dead-stock report is equally inert.
 *
 * There is no money, no deadline and no photo on a dead-stock row; all three
 * stay null and the shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { DeadStockReportRow } from '@/lib/reports/report-rows';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/**
 * Every row here is dormant by definition, so no row is more urgent than
 * another. Tone is never the fact; the pill's word is.
 */
const DEAD_STOCK_TONE: CompoundStateTone = 'neutral';

/**
 * What the pill says for a SKU with stock and NO ledger write at all — the
 * route's `includeNeverMoved` rows, where `days_dormant` is `NULL::int`. The
 * retired cell rendered `Number(null)` into those cells and printed `NaN`.
 */
const NEVER_MOVED_LABEL = 'Never moved';

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null): { label: string; dateKey: string } | null {
  if (!iso) return null;
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return null;
  return { label: format(moment, 'MMM d'), dateKey: format(moment, 'yyyy-MM-dd') };
}

export function reportDeadStockCompoundView(row: DeadStockReportRow): CompoundRowView {
  const moved = civilFace(row.last_move_at);
  const dormant = row.days_dormant;

  return {
    id: row.sku,
    thumbUrl: null,
    title: row.product_title ?? row.sku,
    titleHref: `/inventory/health/sku/${encodeURIComponent(row.sku)}`,
    // Nothing under the title: the layout binds no subtitle, and the stock
    // count is a track. A fallback note here would repeat a column.
    note: null,
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(row.sku, 'SKU'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind a dormancy total.
    platformValue: null,
    carrier: null,
    stateLabel: dormant === null ? NEVER_MOVED_LABEL : `${dormant}d`,
    stateTone: DEAD_STOCK_TONE,
    stateTip:
      dormant === null
        ? `${row.stock} in stock with no ledger write on this SKU`
        : `${dormant} days since the last ledger write`,
    orderedAt: moved
      ? { label: moved.label, tip: `Last move ${moved.label}`, dateKey: moved.dateKey }
      : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a movement stamp.
    ...(moved ? { startedHover: `Last move ${moved.label}` } : null),
    // A dead-stock row has no deadline; the Calendar line stays the honest
    // empty face rather than repeating the stamp above it.
    delay: null,
    amount: null,
  };
}
