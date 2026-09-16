/**
 * `CycleCountLineRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * Faithfulness notes — this adapter paints what the desk painted, not more:
 *
 *  · The BIN is the identity handle. It was a mono `bin_name ?? #bin_id` cell;
 *    the one face now lives in `cycleCountLineBinLabel`, read here and by the
 *    resolver, so the chip, the header sort and the search box agree.
 *  · The SKU is the title, and `titleHref` is the retired `<Link>` to
 *    `/inventory/health/sku/<sku>`. A compound row takes a title href; it does
 *    not take an anchor inside a cell.
 *  · `note` is null: `tolerance` is a bound SUBTITLE fact, and a note fallback
 *    would fight the bound subtitle for the same line.
 *  · **Out-of-tolerance is the PILL's word, never a colour.** The retired Δ
 *    cell chose between three text colours by comparing `|variance|` against
 *    `campaign.variance_tol × expected_qty` — a campaign fact read through a
 *    closure this adapter contract does not have, and tone is not a fact
 *    anyway. The comparison happens where the row is built
 *    (`isCycleCountLineOverTolerance`), travels on the ROW, and is said out
 *    loud: `Counted · over tol`. The arithmetic rides `stateTip`, because the
 *    10rem state track cannot hold it (same escape hatch Incoming's
 *    `Delivered · not scanned` uses).
 *  · Both DATES lines are used: the count stamp on the Hash line, the
 *    approve/reject stamp on the Calendar line via `delay.faceLabel` (this
 *    desk has no deadline, so the lateness vocabulary never applies). The
 *    hover copy leads with the engine's portable `Start date` / `Due date`
 *    name and then this family's detail — teaching
 *    `DATES_START_TIP_OWNS_NAME` two new words would be a line added to an
 *    engine component, which a registration may not do
 *    (`TABLE_ENGINE_ACCEPTANCE`).
 *  · `amount` is null — a bin count has no money fact.
 *
 * Callers: `useCycleCountLinesSpreadsheet` → `DataTable`.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import {
  cycleCountLineBinLabel,
  cycleCountLineStatusLabel,
  cycleCountLineVarianceFace,
  type CycleCountLineRow,
} from '@/lib/inventory/cycle-count-line-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/** Compact civil face + the full stamp, or null when the instant is absent. */
function stamp(iso: string | null): { face: string; dateKey: string; full: string } | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return {
    face: format(at, 'MMM d'),
    dateKey: format(at, 'yyyy-MM-dd'),
    full: format(at, 'MMM d, h:mm a'),
  };
}

/**
 * The pill's TONE. `alert` is the only attention-grabbing tone and it means
 * "needs a human": a line waiting on an approve/reject decision, a line
 * outside tolerance (which will NOT auto-approve when the campaign closes),
 * and a rejected line, whose count somebody has to redo.
 */
function stateToneFor(row: CycleCountLineRow): CompoundStateTone {
  if (row.status === 'pending_review' || row.status === 'rejected') return 'alert';
  if (row.overTolerance) return 'alert';
  if (row.status === 'approved') return 'done';
  return 'neutral';
}

export function cycleCountLinesCompoundView(row: CycleCountLineRow): CompoundRowView {
  const sku = String(row.sku ?? '').trim();
  const counted = stamp(row.countedAt);
  const decided = stamp(row.approvedAt);

  const statusWord = cycleCountLineStatusLabel(row.status) || row.status;
  const varianceFace = cycleCountLineVarianceFace(row.variance);
  const tolFace = String(row.varianceTol ?? '').trim();

  return {
    id: String(row.id),
    thumbUrl: null,
    title: sku || `Line #${row.id}`,
    ...(sku ? { titleHref: `/inventory/health/sku/${encodeURIComponent(sku)}` } : null),
    note: null,
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(cycleCountLineBinLabel(row), 'Bin'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    orderedAt: counted
      ? { label: counted.face, tip: `Counted ${counted.full}`, dateKey: counted.dateKey }
      : null,
    stateLabel: row.overTolerance ? `${statusWord} · over tol` : statusWord,
    stateTone: stateToneFor(row),
    ...(row.overTolerance && varianceFace
      ? {
          stateTip: `Δ ${varianceFace} on ${row.expectedQty} expected exceeds tol ${tolFace}`,
        }
      : null),
    delay: decided ? { days: 0, overdue: false, faceLabel: decided.face } : null,
    ...(decided ? { delayTip: `${statusWord} ${decided.full}` } : null),
    amount: null,
  };
}
