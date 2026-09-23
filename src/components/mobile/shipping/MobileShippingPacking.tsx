'use client';

/**
 * Module #2 — Shipping & Packing execution.
 *
 * This is deliberately a workflow surface, not a second order-management
 * list. Its execution doors consume shared order identity and publish progress
 * back to Order Management.
 */

import Link from 'next/link';
import { History, MapPin, PackageCheck, ScanBarcode } from '@/components/Icons';
import { Inset } from '@/design-system/primitives';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';

export default function MobileShippingPacking() {
  return (
    <main className={`flex h-full min-h-full flex-col ${TOKENS.colors.background}`} aria-label="Shipping and packing">
      <header className="border-b border-border-hairline px-3 pb-3 pt-2">
        <p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-soft">Execution</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-text-default">Shipping &amp; packing</h1>
        <p className="mt-0.5 text-role-caption text-text-muted">Pick, pack, verify, then scan out.</p>
      </header>

      <Inset space="chip">
        <div className="grid grid-cols-2 gap-px border border-border-soft bg-border-soft">
          <Link href="/m/pick" className="flex min-h-12 items-center gap-2 bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">
            <PackageCheck className="h-4 w-4 text-text-accent" aria-hidden />
            Pick work
          </Link>
          <Link href="/m/shipping/stage" className="flex min-h-12 items-center gap-2 bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">
            <MapPin className="h-4 w-4 text-text-warning" aria-hidden />
            Stage rack
          </Link>
          <Link href="/m/shipping/scan-out" className="flex min-h-12 items-center gap-2 bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">
            <ScanBarcode className="h-4 w-4 text-text-success" aria-hidden />
            Scan out
          </Link>
          <Link href="/m/shipping/history" className="flex min-h-12 items-center gap-2 bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">
            <History className="h-4 w-4 text-text-muted" aria-hidden />
            History
          </Link>
          <Link href="/m/shipping/fba" className="col-span-2 flex min-h-12 items-center gap-2 bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">
            <ScanBarcode className="h-4 w-4 text-text-accent" aria-hidden />
            FBA plan
          </Link>
        </div>
      </Inset>
    </main>
  );
}
