'use client';

import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { NavPageActions } from '@/components/desk/NavPageActions';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';

/**
 * The Inventory lane's desk frame. A contextual-sidebar desk (`bare`): the
 * views live in the sidebar, and the header's title, view pills and key strip
 * come from the page's `NavContext`. It adds only the view's declared verbs.
 * Every desk sits on the one fixed-width stage (To ship, Inbound history).
 */
export function InventoryDeskFrame({ children }: { children: ReactNode }) {
  const nav = useNavContext(useCurrentNavPath()).data;
  return (
    <DeskPageLayout bare className="h-full">
      <NavPageActions actions={nav?.actions} />
      {children}
    </DeskPageLayout>
  );
}
