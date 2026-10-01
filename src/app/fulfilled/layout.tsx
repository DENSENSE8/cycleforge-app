'use client';

import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { NavPageActions } from '@/components/desk/NavPageActions';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';

/** Fulfilled uses the same desk frame as the other Fulfillment views. */
export default function FulfilledLayout({ children }: { children: ReactNode }) {
  const nav = useNavContext(useCurrentNavPath()).data;
  return (
    <DeskPageLayout bare>
      <NavPageActions actions={nav?.actions} />
      {children}
    </DeskPageLayout>
  );
}
