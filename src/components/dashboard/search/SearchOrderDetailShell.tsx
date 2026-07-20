'use client';

/**
 * Two-column Search order detail shell: left summary · right uniform tabs.
 */

import { useState } from 'react';
import type { ShippedOrder } from '@/types/orders';
import { SearchOrderDetailHeader } from '@/components/dashboard/search/SearchOrderDetailHeader';
import { SearchOrderSummaryColumn } from '@/components/dashboard/search/SearchOrderSummaryColumn';
import { SearchOrderSectionTabs } from '@/components/dashboard/search/SearchOrderSectionTabs';
import type { SearchOrderSection } from '@/components/dashboard/search/search-order-sections';
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
  initialSection = 'timeline',
}: {
  order: ShippedOrder;
  initialSection?: SearchOrderSection;
}) {
  const [section, setSection] = useState<SearchOrderSection>(initialSection);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      <SearchOrderDetailHeader order={order} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <SearchOrderSummaryColumn order={order} />
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card">
          <SearchOrderSectionTabs active={section} onChange={setSection} />
          <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
            <TabBody section={section} order={order} />
          </div>
        </section>
      </div>
    </div>
  );
}
