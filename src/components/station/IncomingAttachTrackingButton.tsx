'use client';

/**
 * Row-anchored "Add tracking" — only rendered on Incoming AWAITING_TRACKING rows
 * (PO exists, no shipment registered yet). Opens the attach popover pre-targeted
 * to this PO, so the operator attaches tracking without re-searching for the PO
 * they're already looking at. stopPropagation keeps the click off the row's
 * select / group-toggle handlers. Extracted from ReceivingLinesTable.
 */

import { Link2 } from '@/components/Icons';
import { AddValueChipFace } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IncomingAttachTrackingPopover } from '@/components/sidebar/receiving/IncomingAttachTrackingPopover';

const ATTACH_TRACKING_TIP = 'Attach a tracking number to this PO before the box arrives';

export function IncomingAttachTrackingButton({
  poId,
  poNumber,
}: {
  poId: string;
  poNumber: string | null;
}) {
  return (
    // HoverTooltip wraps the popover host (not the cloneElement trigger) so the
    // popover can still clone the native <button> for open-on-click.
    <HoverTooltip label={ATTACH_TRACKING_TIP} focusable={false}>
      <span className="inline-flex shrink-0">
        <IncomingAttachTrackingPopover
          presetPo={{ poId, poNumber }}
          trigger={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={ATTACH_TRACKING_TIP}
              // Sits in the empty tracking chip slot — the shared AddValueChipFace
              // (dashed underline = "nothing here yet, click to add"). Same face the
              // dashboard paste-tracking button uses, so the two can't drift.
              // `px-1.5` mirrors CopyChip's `outerPad='chip'` gutter so this empty
              // state lines up flush with the filled TrackingChip below it in the
              // ChipColumns grid (whose `-mr-1.5` cancels that same trailing gutter).
              // ds-raw-button: passed as `trigger` to IncomingAttachTrackingPopover, which
              // cloneElement()s it to wire open-on-click — must stay a native <button>.
              className="ds-raw-button inline-flex shrink-0 items-center px-1.5 transition-colors"
            >
              <AddValueChipFace label="+ TRK#" icon={<Link2 className="h-3.5 w-3.5 shrink-0" />} size="chip" />
            </button>
          }
        />
      </span>
    </HoverTooltip>
  );
}
