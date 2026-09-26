'use client';

/** Right pane for /sourcing. */

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
