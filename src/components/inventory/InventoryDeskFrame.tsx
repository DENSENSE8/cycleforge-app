'use client';

import type { ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { NavPageActions } from '@/components/desk/NavPageActions';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';

/**
 * The Inventory lane's desk frame, per route. A contextual-sidebar desk
 * (`bare`): the views live in the sidebar, and the header's title, view pills
 * and key strip come from the page's `NavContext`. It adds only the view's
 * declared verbs.
 *
 * Stock and QC labels sit on the fixed-width `card` stage (`DESK_STAGE_FIXED_CLASS`),
 * the same measure as To ship and Inbound history (owner 2026-09-28); Split and
 * Floor still take the full width. Replenish's need sheet stays flush.
 */
export function InventoryDeskFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = useNavContext(useCurrentNavPath()).data;
  const flush = pathname === '/inventory' && searchParams.get('section') === 'replenish';
  return (
    <DeskPageLayout bare className="h-full" stage={flush ? 'flush' : undefined}>
      <NavPageActions actions={nav?.actions} />
      {children}
    </DeskPageLayout>
  );
}
