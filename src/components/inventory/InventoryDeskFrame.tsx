'use client';

import type { ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/**
 * The record-ledger tabs:
 * and SKU Exceptions are exception triage (BRIEF §3), read record by record in
 * the evidence column (owner 2026-09-24).
 */
const LEDGER_PATHS: readonly string[] = ['/inventory/stock', '/inventory/sku-exceptions'];

/** The Inventory desk frame, per route. */
export function InventoryDeskFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLedger =
    LEDGER_PATHS.includes(pathname)
    || (pathname === '/inventory' && searchParams.get('section') === 'replenish');
  if (!isLedger) {
    return <DeskPageLayout className="h-full">{children}</DeskPageLayout>;
  }
  return (
    <DeskPageLayout className="h-full" stage="flush">
      {children}
    </DeskPageLayout>
  );
}
