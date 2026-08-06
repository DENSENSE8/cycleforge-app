/**
 * Rail row VM + status-dot adapters for the Products Labels "Printed" dock.
 * Composes the shared RailRowBody slots — content only, no layout fork.
 */

import type { RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import type { LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';

/** Coarse unit lifecycle → Unbox-style rail status dot. */
const STATUS_DOT: Record<string, string> = {
  RECEIVED: 'bg-blue-500',
  TRIAGED: 'bg-blue-500',
  IN_TEST: 'bg-indigo-500',
  IN_REPAIR: 'bg-amber-500',
  REPAIR_DONE: 'bg-amber-500',
  TESTED: 'bg-emerald-500',
  GRADED: 'bg-emerald-500',
  STOCKED: 'bg-emerald-500',
  ALLOCATED: 'bg-purple-500',
  PICKED: 'bg-purple-500',
  PACKED: 'bg-purple-500',
  LABELED: 'bg-purple-500',
  STAGED: 'bg-purple-500',
  SHIPPED: 'bg-zinc-400',
  RETURNED: 'bg-orange-500',
  RMA: 'bg-orange-500',
  ON_HOLD: 'bg-red-500',
  SCRAPPED: 'bg-red-500',
};

export function labelPrintFeedToRailVM(row: LabelPrintFeedItem): RailRowVM {
  const title = row.product_title || row.sku || row.unit_id || 'Untitled';
  const unitRef = row.unit_id || row.serial_number || row.sku || '—';
  const location = row.current_location?.trim();

  return {
    title,
    titleAttr: title,
    meta: (
      <span className="block truncate font-semibold uppercase tracking-widest text-text-soft">
        <span className="font-mono normal-case tracking-normal">{unitRef}</span>
        {location ? (
          <>
            <span className="mx-1 text-text-faint">·</span>
            <span className="font-mono normal-case tracking-normal">{location}</span>
          </>
        ) : null}
      </span>
    ),
  };
}

export function getLabelPrintStatusDot(row: LabelPrintFeedItem): string {
  const status = row.current_status?.toUpperCase();
  if (status && STATUS_DOT[status]) return STATUS_DOT[status];
  // Fresh print with no unit status yet — emerald "done" glance.
  return 'bg-emerald-500';
}

export function getLabelPrintStatusDotLabel(row: LabelPrintFeedItem): string {
  const status = row.current_status?.trim();
  if (status) return status;
  return 'Label printed';
}
