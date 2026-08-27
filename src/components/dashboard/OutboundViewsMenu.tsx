'use client';

/**
 * To-ship Band-3 Views — thin adapter over {@link WorkbenchViewsMenu} that
 * resolves the outbound surface (`dashboard_unshipped` / packed / shipped) from
 * the current lifecycle tab.
 *
 * Placement: Band 3 trailing find (`OutboundTriageBand`), never Band-1 leading.
 */

import { useSearchParams } from 'next/navigation';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import { outboundSavedViewsConfig } from '@/components/unshipped/outbound-sidebar-shared';

export function OutboundViewsMenu() {
  const searchParams = useSearchParams();
  const orderView = getDashboardOrderViewFromSearch(searchParams);
  const mode = orderView === 'packed' ? 'packed' : orderView === 'shipped' ? 'shipped' : 'unshipped';
  const { storageKey, paramKeys } = outboundSavedViewsConfig(mode);

  return (
    <WorkbenchViewsMenu
      storageKey={storageKey}
      paramKeys={paramKeys}
      emptyHint="No saved views yet — filter the queue (staff, late, attention), then save it here."
    />
  );
}
