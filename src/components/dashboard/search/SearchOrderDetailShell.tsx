'use client';

/**
 * Search order detail shell — Shopify feel: order identity header, full-width
 * section tabs, one centered padded content lane (no left summary sidebar; the
 * Overview tab carries the at-a-glance facts).
 */

import { useState } from 'react';
import type { ShippedOrder } from '@/types/orders';
import { SearchOrderContextBar } from '@/components/dashboard/search/SearchOrderContextBar';
import { SearchOrderDetailHeader } from '@/components/dashboard/search/SearchOrderDetailHeader';
import { SearchOrderSectionTabs } from '@/components/dashboard/search/SearchOrderSectionTabs';
import type { SearchOrderSection } from '@/components/dashboard/search/search-order-sections';
import { SearchOrderOverviewTab } from '@/components/dashboard/search/tabs/SearchOrderOverviewTab';
import { SearchOrderShippingTab } from '@/components/dashboard/search/tabs/SearchOrderShippingTab';
import { SearchOrderProductTab } from '@/components/dashboard/search/tabs/SearchOrderProductTab';
import { SearchOrderDocumentsTab } from '@/components/dashboard/search/tabs/SearchOrderDocumentsTab';
import { SearchOrderTimelineTab } from '@/components/dashboard/search/tabs/SearchOrderTimelineTab';
import { SearchOrderCustomerTab } from '@/components/dashboard/search/tabs/SearchOrderCustomerTab';
import { SearchOrderWarrantyTab } from '@/components/dashboard/search/tabs/SearchOrderWarrantyTab';
import { SearchOrderConversationTab } from '@/components/dashboard/search/tabs/SearchOrderConversationTab';

function TabBody({
  section,
  order,
}: {
  section: SearchOrderSection;
  order: ShippedOrder;
}) {
  switch (section) {
    case 'overview':
      return <SearchOrderOverviewTab order={order} />;
    case 'shipping':
      return <SearchOrderShippingTab order={order} />;
    case 'product':
      return <SearchOrderProductTab order={order} />;
    case 'documents':
      return <SearchOrderDocumentsTab order={order} />;
    case 'timeline':
      return <SearchOrderTimelineTab order={order} />;
    case 'customer':
      return <SearchOrderCustomerTab order={order} />;
    case 'warranty':
      return <SearchOrderWarrantyTab order={order} />;
    case 'conversation':
      return <SearchOrderConversationTab order={order} />;
  }
}

export function SearchOrderDetailShell({
  order,
  initialSection = 'overview',
}: {
  order: ShippedOrder;
  initialSection?: SearchOrderSection;
}) {
  const [section, setSection] = useState<SearchOrderSection>(initialSection);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      {/* One padded lane sized to the detail width. Order identity hangs from
          the top as a bookmark (station entity-context chrome), tabs sit below
          it (not sticky), then the tab body — all aligned with the cards. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6">
          <SearchOrderContextBar identity={<SearchOrderDetailHeader order={order} />} />
          <div className="mt-4 border-b border-border-hairline">
            <SearchOrderSectionTabs active={section} onChange={setSection} />
          </div>
          <div className="py-6" role="tabpanel">
            <TabBody section={section} order={order} />
          </div>
        </div>
      </div>
    </div>
  );
}
