'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { NavPageActions } from '@/components/desk/NavPageActions';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';
import { IMPORTS_PATH } from '@/lib/imports/record-faces';

/**
 * The Operations desk frame, per route. `/operations` keeps its tabbed frame;
 * Imports is a contextual-sidebar desk (`bare`): its views and filters live in
 * the sidebar and the header comes from the page's `NavContext`. Its triage
 * card lists sit on the card stage, like Shipping's To ship.
 */
export function OperationsDeskFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === IMPORTS_PATH) return <ContextualDesk>{children}</ContextualDesk>;
  return <DeskPageLayout className="h-full">{children}</DeskPageLayout>;
}

function ContextualDesk({ children }: { children: ReactNode }) {
  const nav = useNavContext(useCurrentNavPath()).data;
  return (
    <DeskPageLayout bare className="h-full">
      <NavPageActions actions={nav?.actions} />
      {children}
    </DeskPageLayout>
  );
}
