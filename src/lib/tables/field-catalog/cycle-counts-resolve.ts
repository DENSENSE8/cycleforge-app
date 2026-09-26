/** Cycle-counts slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import {
  campaignStatusLabel,
  type CycleCountCampaignRow,
} from '@/lib/inventory/cycle-count-campaign-row';

function str(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function resolveCycleCountsSlotValue(
  row: CycleCountCampaignRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'cycle-counts.id':
      return { kind: 'value', text: str(row.id) };
    case 'cycle-counts.name':
      return { kind: 'value', text: str(row.name) };
    case 'cycle-counts.status':
      return { kind: 'value', text: str(campaignStatusLabel(row.status)) };
    case 'cycle-counts.tol': {
      // `numeric` comes back as `0.050`; the trailing zero is storage
      // precision, not a fact. The word rides the face because this is a
      // SUBTITLE part under the campaign name, where no header names it.
      const raw = String(row.varianceTol ?? '').trim();
      if (!raw) return { kind: 'value', text: null };
      const n = Number(raw);
      return { kind: 'value', text: `tol ${Number.isFinite(n) ? n : raw}` };
    }
    case 'cycle-counts.lines':
      return { kind: 'value', text: str(row.totalLines) };
    case 'cycle-counts.counted':
      return { kind: 'value', text: str(row.countedLines) };
    case 'cycle-counts.review':
      return { kind: 'value', text: str(row.pendingReviewLines) };
    case 'cycle-counts.approved':
      return { kind: 'value', text: str(row.approvedLines) };
    case 'cycle-counts.created':
      return { kind: 'value', text: str(row.createdAt) };
    case 'cycle-counts.created_by':
      // The desk has always printed `system` for an unattributed campaign —
      // a blank cell would read as missing data rather than as a machine run.
      return { kind: 'value', text: str(row.createdByName) ?? 'system' };
    default:
      return null;
  }
}
