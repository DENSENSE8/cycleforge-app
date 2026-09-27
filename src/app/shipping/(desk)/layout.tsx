'use client';

import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { NavPageActions } from '@/components/desk/NavPageActions';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';

/**
 * The Shipping **desk** frame — Exceptions · Picking · To ship · Shipped.
 *
 * No tab row (operator 2026-09-26): views, Find and filters live in the
 * contextual sidebar. The header names the view you are on and carries its
 * verbs top-right, over the list they act on (operator 2026-09-27). Both read
 * the same `NavContext` the sidebar paints.
 */
export default function ShippingDeskLayout({ children }: { children: ReactNode }) {
  const nav = useNavContext(useCurrentNavPath()).data;
  const view = nav?.sections.flatMap((section) => section.items).find((item) => item.active);
  return (
    <DeskPageLayout bare stage="card" title={view?.label}>
      <NavPageActions actions={nav?.actions} />
      {children}
    </DeskPageLayout>
  );
}
