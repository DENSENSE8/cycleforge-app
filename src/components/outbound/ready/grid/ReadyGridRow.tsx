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
import {
  READY_GRID_COLUMNS,
  readyGridTemplate,
  type ReadyGridColumn,
} from './ready-grid-layout';

export {
  readyFallbackStateLabel,
  readyHitTitle,
  readyVerdictLabel,
} from './cells';

/**
 * One recently-tested hit — CSS-grid columns matching {@link READY_GRID_COLUMNS}.
 *
 * Deliberately NOT interactive as a row: these are append-only history records
 * with no detail plane to open, so the row carries no `role="button"` and no
 * pointer cursor. The only affordance is the action cell's Stage-FBA link.
 *
 * Desktop cells live under `./cells/`; edit a column there, not here.
 */
export const ReadyGridRow = memo(function ReadyGridRow({
  hit,
  columns = READY_GRID_COLUMNS,
}: {
  hit: AllocationHit;
  columns?: readonly ReadyGridColumn[];
}) {
  const ctx: ReadyGridCellCtx = {
    hit,
    tierMeta: hit.velocityTier ? velocityTierMeta(hit.velocityTier) : null,
    condGrade: (hit.conditionGrade || '').toUpperCase(),
  };

  return (
    <LedgerGridLeafRow
      data-ready-row-id={hit.testingResultId}
      columns={columns}
      template={readyGridTemplate(columns)}
      selected={false}
      capabilities={READY_GRID_CAPABILITIES}
      // The shared fill helper assumes a pickable row and bakes in
      // `cursor-pointer`. This row opens nothing, so the pointer would promise
      // an interaction that does not exist — override it (twMerge keeps the
      // later cursor).
      className="cursor-default"
      renderCell={(col, { rule }) => renderReadyGridCell(col, rule, ctx)}
    />
  );
});
