'use client';

import { GridStatusCellValue } from '@/components/ui/grid-cells';
import { receivingHistoryStatusTooltip } from './receiving-grid-row-helpers';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/** The row's lifecycle **state**: */
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
      style={receivingDataCellStyle(col, ctx)}>
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
