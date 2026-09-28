'use client';

import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { NavPageActions } from '@/components/desk/NavPageActions';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';

/**
 * The Shipping **desk** frame — Exceptions · Picking · To ship · Shipped, and FBA.
 *
 * A contextual-sidebar desk (`bare`): the views live in the sidebar, and the
 * header's title, hover-to-unfold view pills and key strip come from the
 * page's `NavContext` (`DeskPageLayout` → `useNavDeskHeader`). This layout
 * adds only the view's declared verbs, top-right over the list they act on.
 */
export default function ShippingDeskLayout({ children }: { children: ReactNode }) {
  const nav = useNavContext(useCurrentNavPath()).data;
  return (
    <DeskPageLayout bare stage="card">
      <NavPageActions actions={nav?.actions} />
      {children}
    </DeskPageLayout>
  );
}
