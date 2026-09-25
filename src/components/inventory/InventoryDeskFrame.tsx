'use client';

import type { ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/**
 * The record-ledger tabs: full-width flush stage (one industrial bar with the
 * desk tabs as flush segments, rows edge to edge) in a TRIAGE region — Stock
 * and SKU Exceptions are exception triage (BRIEF §3), read record by record in
 * the evidence column (owner 2026-09-24).
 */
const LEDGER_PATHS: readonly string[] = ['/inventory/stock', '/inventory/sku-exceptions'];

/**
 * The Inventory desk frame, per route. The ledger tabs run flush in a triage
 * region; every other tab (Ledger, Locations, the detail routes) keeps the
 * card until it adopts the ledger itself — the same page-by-page rollout the
 * Shipping desk runs (`app/shipping/(desk)/layout.tsx`).
 */
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
    <ModeRegion mode="triage" className="contents">
      <DeskPageLayout className="h-full" stage="flush">
        {children}
      </DeskPageLayout>
    </ModeRegion>
  );
}
