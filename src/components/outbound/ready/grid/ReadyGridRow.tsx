'use client';

import { memo } from 'react';
import type { AllocationHit } from '@/lib/channel-allocation';
import { velocityTierMeta } from '@/lib/velocity-tier-tone';
import { LedgerGridLeafRow } from '@/design-system/components/grid';
import {
  renderReadyGridCell,
  type ReadyGridCellCtx,
} from './cells';
import { READY_GRID_CAPABILITIES } from './ready-grid-descriptor';
import { readyGridTemplate, type ReadyGridColumn } from './ready-grid-layout';

/** One recently-tested hit — CSS-grid columns matching the MOUNTED model (a `SlotLayout` materialization since the wave 1.1 hand-model… */
export const ReadyGridRow = memo(function ReadyGridRow({
  hit,
  columns,
}: {
  hit: AllocationHit;
  columns: readonly ReadyGridColumn[];
}) {
  const ctx: ReadyGridCellCtx = {
    hit,
    tierMeta: hit.velocityTier ? velocityTierMeta(hit.velocityTier) : null,
    condGrade: (hit.conditionGrade || '').toUpperCase(),
    columns,
  };

  return (
    <LedgerGridLeafRow
      data-ready-row-id={hit.testingResultId}
      columns={columns}
      template={readyGridTemplate(columns)}
      selected={false}
      capabilities={READY_GRID_CAPABILITIES}
      // The shared fill helper assumes a pickable row and bakes in `cursor-pointer`.
      className="cursor-default"
      renderCell={(col, { rule }) => renderReadyGridCell(col, rule, ctx)}
    />
  );
});
