'use client';

import { GridStatusCellValue } from '@/components/ui/grid-cells';
import { receivingHistoryStatusTooltip } from './receiving-grid-row-helpers';
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
 * chip for the same job. Fill/ink + dot come from ctx (`statusBadgeClass` /
 * `statusDot`) — fine workflow stages or coarse receiving lifecycle, never a
 * cell-local map.
 *
 * This is also why the column-display `chip` mode no longer wraps this cell: the
 * value IS a chip, and a chip inside a chip is two rings.
 *
 * ## History tip (2026-08-04)
 *
 * On History, DONE / coarse Received is bare — no chip tooltip. UNBOXED tips
 * with the inventory-provider sync gap via {@link receivingHistoryStatusTooltip}.
 * Non-history surfaces keep the stage-stamp tip chain.
 */
export function ReceivingStatusCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const {
    statusDot,
    statusBadgeClass,
    statusVocabulary,
    stageLabel,
    stageTip,
    dateCell,
    row,
    isHistory,
    inventoryProviderLabel,
  } = ctx;
  const tooltip = isHistory
    ? receivingHistoryStatusTooltip({
        workflowStatus: row.workflow_status,
        inventoryProviderLabel,
        stageTip,
        statusVocabulary,
      })
    : stageTip || dateCell?.tooltip || stageLabel;
  return (
    <div data-col="status" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}>
      {/* A stage with no stamp is still a fact worth showing; a row with no
          stage has nothing to say here and takes the honest em dash. */}
      <GridStatusCellValue
        label={stageLabel || null}
        toneClass={statusBadgeClass}
        dotClass={statusDot}
        tooltip={tooltip}
      />
    </div>
  );
}
