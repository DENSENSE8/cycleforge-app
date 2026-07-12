'use client';

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PaneHeaderTabs } from '@/components/ui/pane-header';
import type { ShippedLayout } from '@/components/shipped/dashboard-table/useShippedTableFilters';

/**
 * Shipped presentation lens — All (flat day-banded list) vs Pipeline (outbound
 * swimlanes). URL-backed (`?layout=board`); default All omits the param.
 */
export function OutboundShippedLayoutTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const layout: ShippedLayout = searchParams.get('layout') === 'board' ? 'board' : 'all';

  const onChange = useCallback(
    (next: ShippedLayout) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') params.delete('layout');
      else params.set('layout', 'board');
      const nextSearch = params.toString();
      const nextPath = pathname || '/dashboard';
      const nextUrl = nextSearch ? `${nextPath}?${nextSearch}` : nextPath;
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', nextUrl);
      }
    },
    [pathname, searchParams],
  );

  return (
    <PaneHeaderTabs
      dense
      tabs={[
        { value: 'all' as const, label: 'All' },
        { value: 'board' as const, label: 'Pipeline' },
      ]}
      value={layout}
      onChange={onChange}
      className="shrink-0 bg-transparent px-0 py-0"
    />
  );
}