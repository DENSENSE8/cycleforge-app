'use client';

import { GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { ReceivingChipValue } from './ReceivingChipValue';
import {
  receivingCellWantsChip,
  receivingDataCellClass,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * The row's lifecycle answer in ONE track: **dot · stage name · day · time**.
 *
 * It replaces reading the same fact across two columns. `date` and `stage` each
 * carried half of it — `Jul 31` in one, `4:19 PM` in another, under a header
 * whose label (`UNBOXED` / `SCANNED` / `TESTED`) was the only place the *stage*
 * appeared at all. So the stage name lived in the chrome rather than the row,
 * which meant a row could not be read on its own: an operator scanning down the
 * grid had to keep the column header in their head to know what the time was
 * the time OF, and folding two tracks into one recovers ~5rem of width that the
 * product title can use.
 *
 * The dot is the same `statusDot` the row's meta track paints (qty-complete wins
 * over status — `getStatusDotBg`), so the two cannot disagree. The stage LABEL
 * resolves from the workflow-stage registry, never a local map.
 *
 * `date` and `stage` survive as `tier: 'optional'` columns for anyone who wants
 * the split back; they are not deleted, because a staffer who curated them on is
 * entitled to keep them.
 */
export function ReceivingStatusCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { statusDot, stageLabel, stageDisplay, stageTip, dateCell } = ctx;
  const chip = receivingCellWantsChip(col, ctx);
  const day = dateCell?.label;
  const time = stageDisplay && stageDisplay !== '--:--' ? stageDisplay : null;
  // A stage with no stamp is still a fact worth showing; a row with neither a
  // stage nor a stamp has nothing to say and takes the honest em dash.
  const hasAnything = Boolean(stageLabel || day || time);

  return (
    <div data-col="status" className={receivingDataCellClass(col, rule, ctx)}>
      {hasAnything ? (
        <HoverTooltip label={stageTip || dateCell?.tooltip || stageLabel} focusable={false}>
          <ReceivingChipValue enabled={chip}>
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn('h-2 w-2 shrink-0 rounded-full', statusDot)}
                aria-hidden
              />
              {stageLabel ? (
                <span className="shrink-0 text-role-caption font-semibold text-text-default">
                  {stageLabel}
                </span>
              ) : null}
              {day || time ? (
                <span className="min-w-0 truncate tabular-nums text-role-caption text-text-muted">
                  {[day, time].filter(Boolean).join(' ')}
                </span>
              ) : null}
            </span>
          </ReceivingChipValue>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
