'use client';

/** The /sourcing stage. Its views, filters and verbs live in the contextual sidebar. */

import { useSearchParams } from 'next/navigation';
import { resolveSourcingMode } from './sourcing-shared';
import { ScoutPane } from './workspace/ScoutPane';
import { QueuePane } from './workspace/QueuePane';
import { SearchesPane } from './workspace/SearchesPane';
import { SuppliersPane } from './workspace/SuppliersPane';
import { SuppliersManagementTab } from '@/components/admin/sourcing/SuppliersManagementTab';
import { BoseModelsManagementTab } from '@/components/admin/sourcing/BoseModelsManagementTab';
import { CompatibilityManagementTab } from '@/components/admin/sourcing/CompatibilityManagementTab';
import { BoseModelPickerPane } from '@/components/admin/sourcing/BoseModelPickerPane';
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
        <div className="flex h-full min-h-0">
          <BoseModelPickerPane param="model" />
          <div className="min-w-0 flex-1 overflow-y-auto">
            <BoseModelsManagementTab />
          </div>
        </div>
      ) : mode === 'compatibility' ? (
        <div className="flex h-full min-h-0">
          <BoseModelPickerPane param="boseModelId" allRow={{ title: 'All edges', subtitle: 'Every model' }} />
          <div className="min-w-0 flex-1 overflow-y-auto">
            <CompatibilityManagementTab />
          </div>
        </div>
      ) : mode === 'analytics' ? (
        <AnalyticsPane />
      ) : (
        <WatchlistPane />
      )}
    </div>
  );
}
