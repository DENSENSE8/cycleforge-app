'use client';

/**
 * One quiet caption above the Incoming sheet, stating the lane's own predicate.
 *
 * Lives in the KPI chrome band (Sheets flush mount) — adjacent to the sheet,
 * not a second sticky layer. A caption, not an alert: `text-role-micro
 * text-text-faint` with a `HoverTooltip` for the why. No dashed callout, no
 * coloured banner.
 *
 * Visibility is DERIVED next to the query (`resolveIncomingLaneNote`), never
 * from a hand-maintained list of param names here.
 */

import { Info } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { resolveIncomingLaneNote } from '@/lib/receiving/incoming-lane-note';

export function IncomingLaneNote({
  view,
  trackingFiltered,
  rowCount,
  providerLabel,
}: {
  view: string;
  trackingFiltered: boolean;
  rowCount: number;
  providerLabel?: string | null;
}) {
  const note = resolveIncomingLaneNote({ view, trackingFiltered, rowCount, providerLabel });
  if (!note) return null;

  return (
    <p className="flex items-center gap-1.5 py-1 text-role-micro text-text-faint">
      <span className="min-w-0 truncate">{note.text}</span>
      <HoverTooltip label={note.tip} focusable={false}>
        <span className="shrink-0 text-text-faint">
          <Info className="h-3 w-3" />
        </span>
      </HoverTooltip>
    </p>
  );
}
