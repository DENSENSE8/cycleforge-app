/**
 * `CycleCountCampaignRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * Faithfulness notes — this adapter paints what the desk painted, not more:
 *  · The campaign NAME is the title. It was a `<Link>` inside a cell; opening a
 *    row is the binding's `navigate` record plane now, so the row's open intent
 *    carries the route and no cell carries an anchor.
 *  · `tol` is NOT here. It is a bound SUBTITLE fact, resolved by the family
 *    resolver into the item cell's second line — which is why `note` is null:
 *    a note fallback would fight the bound subtitle for the same line.
 *  · `delay` is null. A count campaign has no deadline to be late against, so
 *    the Dates cell's second line stays blank rather than borrowing the start.
 *  · The retired `review` cell washed amber when `pending_review_lines > 0`.
 *    Tone is not a fact and does not become a field: a campaign with lines in
 *    review is a row that needs a human, which is exactly the `alert` state
 *    tone. The count itself stays a plain number in its own track.
 *
 * Callers: `useCycleCountsSpreadsheet` → `DataTable`.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import {
  campaignStatusLabel,
  type CycleCountCampaignRow,
} from '@/lib/inventory/cycle-count-campaign-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

export function cycleCountsCompoundView(row: CycleCountCampaignRow): CompoundRowView {
  const created = new Date(row.createdAt);
  const hasCreated = !Number.isNaN(created.getTime());
  // Compact civil face — no year (slot-table date law).
  const createdFace = hasCreated ? format(created, 'MMM d') : null;
  const createdTip = createdFace ? `Created ${createdFace}` : null;

  const inReview = row.pendingReviewLines > 0;
  const tone: CompoundStateTone = inReview
    ? 'alert'
    : row.status === 'open'
      ? 'neutral'
      : 'done';

  return {
    id: String(row.id),
    thumbUrl: null,
    title: String(row.name ?? '').trim() || `Campaign #${row.id}`,
    note: null,
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(String(row.id), 'Cycle count id'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    orderedAt: createdFace
      ? {
          label: createdFace,
          ...(createdTip ? { tip: createdTip } : null),
          dateKey: format(created, 'yyyy-MM-dd'),
        }
      : null,
    // Explicit Hash hover SoT — the tip already names the line, so the engine
    // must not prefix the portable "Start date ·".
    ...(createdTip ? { startedHover: createdTip } : null),
    stateLabel: campaignStatusLabel(row.status) || row.status,
    stateTone: tone,
    ...(inReview
      ? { stateTip: `${row.pendingReviewLines} line(s) pending review` }
      : null),
    delay: null,
    amount: null,
  };
}
