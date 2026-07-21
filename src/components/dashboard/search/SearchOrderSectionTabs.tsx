'use client';

import { PaneHeaderTabs } from '@/components/ui/pane-header';
import {
  SEARCH_ORDER_SECTION_TABS,
  type SearchOrderSection,
} from '@/components/dashboard/search/search-order-sections';

export function SearchOrderSectionTabs({
  active,
  onChange,
}: {
  active: SearchOrderSection;
  onChange: (next: SearchOrderSection) => void;
}) {
  return (
    <PaneHeaderTabs<SearchOrderSection>
      dense
      tabs={[...SEARCH_ORDER_SECTION_TABS]}
      value={active}
      onChange={onChange}
    />
  );
}
