'use client';

import { GridStatusCellValue } from '@/components/ui/grid-cells';
import { workflowStageBadge } from '@/lib/receiving/workflow-stages';
import {
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * The row's lifecycle **state**: dot · stage name. Nothing else.
 *
 * ## Why the stamp is NOT in here (ruled 2026-08-02, same day it was folded in)
 *
 * For one day this track read `dot · stage · day · time`, on the argument that
 * a row should be readable without keeping the header in your head. The first
 * half of that argument was right and is kept — the stage NAME belongs in the
 * row, not in a runtime header label. The second half was not: a state and a
 * timestamp are two different facts, and a column is how a spreadsheet says
 * "these are the same kind of thing down this axis".
 *
 * Merging them cost the properties a column exists to provide: the stamps stop
 * aligning as a column of times an eye can run down, the track has to be sized
 * for the longest state word *plus* the longest stamp, and the pair sorts and
 * resizes as one thing when the operator wants them apart. `Done` beside
 * `Jul 31 4:19 PM` in one cell is a sentence; two cells are a table.
 *
 * So: **state here, stamp in `date`** ({@link ReceivingDateCell}) — which is
 * `core` again and carries the full day + time, not just the day.
 *
 * ## Dot + chip (2026-08-02)
 *
 * Rendered through the house {@link GridStatusCellValue}: the 3-layer chip with
 * the dot leading it, inside. Bare semibold text in a ruled band read as another
 * data value rather than as a state, and four surfaces had each grown a local
 * chip for the same job. Both halves resolve from the workflow-stage registry —
 * `workflowStageBadge` for the fill/ink, `statusDot` for the dot (which is
 * qty-complete-aware, so it can lead the chip's stage) — never a local map.
 *
 * This is also why the column-display `chip` mode no longer wraps this cell: the
 * value IS a chip, and a chip inside a chip is two rings.
 */
export function ReceivingStatusCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { statusDot, stageLabel, stageTip, dateCell, row } = ctx;
  return (
    <div data-col="status" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}>
      {/* A stage with no stamp is still a fact worth showing; a row with no
          stage has nothing to say here and takes the honest em dash. */}
      <GridStatusCellValue
        label={stageLabel || null}
        toneClass={workflowStageBadge(row.workflow_status)}
        dotClass={statusDot}
        tooltip={stageTip || dateCell?.tooltip || stageLabel}
      />
    </div>
  );
}
