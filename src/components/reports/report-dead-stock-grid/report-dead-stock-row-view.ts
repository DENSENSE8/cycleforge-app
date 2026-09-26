/** `DeadStockReportRow → CompoundRowView` — the dead-stock adapter. */

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
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
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
