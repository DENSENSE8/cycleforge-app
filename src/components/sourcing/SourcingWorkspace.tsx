'use client';

/**
 * Right pane for /sourcing. Reads ?mode= and renders one of: Queue (prioritized
 * demand), Scout (model → compatible parts + market search), Watchlist (saved
 * candidates), Searches (standing watches), Suppliers (rollup + CRUD editor).
 * The sidebar (SourcingSidebarPanel) owns the search/filter inputs; this pane
 * is the display.
 *
 * Suppliers is the ONE home for supplier data (admin dissolution, 2026-09-06):
 * the rollup lists, and `?supplier=<id|new>` swaps in the ex-admin editor —
 * the same component /admin?section=suppliers rendered, reading the same param.
 *
 * Thin composition layer — each pane lives under `./workspace/`.
 */

import { useSearchParams } from 'next/navigation';
import { resolveSourcingMode } from './sourcing-shared';
import { ScoutPane } from './workspace/ScoutPane';
import { QueuePane } from './workspace/QueuePane';
import { SearchesPane } from './workspace/SearchesPane';
import { SuppliersPane } from './workspace/SuppliersPane';
import { SuppliersManagementTab } from '@/components/admin/sourcing/SuppliersManagementTab';
import { BoseModelsManagementTab } from '@/components/admin/sourcing/BoseModelsManagementTab';
import { CompatibilityManagementTab } from '@/components/admin/sourcing/CompatibilityManagementTab';
import { WatchlistPane } from './workspace/WatchlistPane';
import { AnalyticsPane } from './workspace/AnalyticsPane';

export function SourcingWorkspace() {
  const searchParams = useSearchParams();
  const mode = resolveSourcingMode(searchParams.get('mode'));

  return (
    <div className="h-full overflow-y-auto bg-surface-canvas">
      {mode === 'scout' ? (
        <ScoutPane />
      ) : mode === 'queue' ? (
        <QueuePane />
      ) : mode === 'searches' ? (
        <SearchesPane />
      ) : mode === 'suppliers' ? (
        searchParams.get('supplier') ? (
          <SuppliersManagementTab />
        ) : (
          <SuppliersPane />
        )
      ) : mode === 'models' ? (
        <BoseModelsManagementTab />
      ) : mode === 'compatibility' ? (
        <CompatibilityManagementTab />
      ) : mode === 'analytics' ? (
        <AnalyticsPane />
      ) : (
        <WatchlistPane />
      )}
    </div>
  );
}
