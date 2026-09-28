'use client';

import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { NavPageActions } from '@/components/desk/NavPageActions';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';

/**
 * `/sourcing` — the Sourcing desk frame. A contextual-sidebar desk (`bare`):
 * the views live in the sidebar, and the header's title, view pills and key
 * strip come from the page's `NavContext`. This layout adds only the view's
 * declared verbs (Models' Add model), top-right over the list they act on.
 */
export default function SourcingLayout({ children }: { children: ReactNode }) {
  const nav = useNavContext(useCurrentNavPath()).data;
  return (
    <DeskPageLayout bare className="h-full">
      <NavPageActions actions={nav?.actions} />
      {children}
    </DeskPageLayout>
  );
}
