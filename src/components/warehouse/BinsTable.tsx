'use client';

/**
 * Enriched bin table for the inventory hub main area — thin host over the
 * Workbench spreadsheet SoT ({@link BinsGridView} → `LedgerGridSurface`).
 *
 * Public API unchanged: parent owns bulk selection + the flyout open gesture.
 */

import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import { BinsGridView } from '@/components/warehouse/bins-grid/BinsGridView';

interface Props {
  rows: BinsOverviewRow[];
  loading: boolean;
  /** Selection state (controlled by parent so the bulk action bar can read it). */
  selected: Set<number>;
  onSelectChange: (next: Set<number>) => void;
  onRowClick: (row: BinsOverviewRow) => void;
}

export function BinsTable({ rows, loading, selected, onSelectChange, onRowClick }: Props) {
  return (
    <div className="flex min-h-[240px] min-w-0 flex-col">
      <BinsGridView
        rows={rows}
        loading={loading}
        selected={selected}
        onSelectChange={onSelectChange}
        onRowClick={onRowClick}
        emptyMessage="No bins match the current filters."
      />
    </div>
  );
}
