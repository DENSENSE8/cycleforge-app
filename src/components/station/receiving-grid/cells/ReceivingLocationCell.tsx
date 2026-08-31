'use client';

import { GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { triageLaneLabel } from '@/lib/receiving/triage-lane-policy';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * Staging shelf face — `room · name` (e.g. `Receiving · Returns — Testing`).
 *
 * A PLACE LABEL, not a scannable identifier: it is prose the operator reads,
 * never a bin barcode they retype. So it renders as plain truncated text with a
 * single {@link HoverTooltip} for the full path + lane — never `CopyableCellValue`
 * (mono + click-to-copy + `historyKind="bin"` clipboard history), which also
 * opened its OWN copy tooltip and stacked two bubbles on one hover.
 */
export function ReceivingLocationCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const locLabel = (ctx.row.staging_location_label || '').trim();
  const lane = triageLaneLabel(ctx.row.priority_lane);
  const tip = locLabel
    ? ctx.row.priority_lane
      ? `${locLabel} · ${lane}`
      : locLabel
    : null;
  return (
    <div data-col="location" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}>
      {locLabel ? (
        <HoverTooltip label={tip ?? locLabel} focusable={false}>
          <span className="min-w-0 truncate text-role-caption text-text-muted">
            {locLabel}
          </span>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
