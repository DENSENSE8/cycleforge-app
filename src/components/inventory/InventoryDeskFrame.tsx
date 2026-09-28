'use client';

import type { ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { NavPageActions } from '@/components/desk/NavPageActions';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';
import { QC_LABELS_PATH } from '@/lib/labels/qc-label-views';

/**
 * The record ledgers run flush: Stock (and SKU Exceptions, its on-hold
 * narrowing) is exception triage read record by record in the evidence
 * column (owner 2026-09-24), and so is QC labels.
 */
const LEDGER_PATHS: readonly string[] = ['/inventory/stock', '/inventory/sku-exceptions', QC_LABELS_PATH];

/**
 * The Inventory lane's desk frame, per route. A contextual-sidebar desk
 * (`bare`): the views live in the sidebar, and the header's title, view pills
 * and key strip come from the page's `NavContext`. It adds only the view's
 * declared verbs.
 */
export function InventoryDeskFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = useNavContext(useCurrentNavPath()).data;
  const isLedger =
    LEDGER_PATHS.includes(pathname)
    || (pathname === '/inventory' && searchParams.get('section') === 'replenish');
  return (
    <DeskPageLayout bare className="h-full" stage={isLedger ? 'flush' : undefined}>
      <NavPageActions actions={nav?.actions} />
      {children}
    </DeskPageLayout>
  );
}
