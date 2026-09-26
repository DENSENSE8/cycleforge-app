/** `CycleCountCampaignRow → CompoundRowView` — pure, strings and enums, no JSX. */

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
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
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
