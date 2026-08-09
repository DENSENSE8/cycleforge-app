'use client';

/**
 * Band-1 **Views** menu for the rail-less To-ship desk (Pattern E).
 *
 * When the left context rail is gone (`isRaillessOrderFeedSurface`), the two jobs
 * the rail legitimately held — **saved views** and **personal scope (My queue)**
 * — move into a top-chrome star-menu, Zendesk-style. It is a thin composer over
 * {@link TableOptionsMenu} (the sanctioned second face of `useSavedViews`), so
 * there is no fork: the same store drives this menu, the mobile rail list, and
 * the station `⋮` menus.
 *
 * Scope options ("My work" / "All staff") mount only when the operator is signed
 * in as staff — same honest-absence rule the rail's My-queue row used.
 */

import { useSearchParams } from 'next/navigation';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { useStaffFilter } from '@/hooks/useStaffFilter';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import { outboundSavedViewsConfig } from '@/components/unshipped/outbound-sidebar-shared';
import type { StationScope } from '@/lib/station/table-url-params';

export function OutboundViewsMenu() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const staffFilter = useStaffFilter();

  const orderView = getDashboardOrderViewFromSearch(searchParams);
  const savedMode =
    orderView === 'packed' ? 'packed' : orderView === 'shipped' ? 'shipped' : 'unshipped';
  const { storageKey, paramKeys } = outboundSavedViewsConfig(savedMode);

  const myStaffId = user?.staffId && user.staffId > 0 ? user.staffId : null;
  const scopeValue: StationScope =
    myStaffId != null && staffFilter.staffId === myStaffId ? 'mine' : 'all';

  return (
    <TableOptionsMenu
      triggerIcon="views"
      triggerLabel="Views"
      showDensity={false}
      savedViews={{ storageKey, paramKeys }}
      scope={
        myStaffId != null
          ? {
              value: scopeValue,
              onChange: (next) => staffFilter.setStaff(next === 'mine' ? myStaffId : null),
              staffFilter,
            }
          : undefined
      }
    />
  );
}
