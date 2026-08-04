'use client';

/**
 * Dashboard page — Sales domain host + legacy outbound redirect shell.
 *
 * Outbound To-ship graduated to `/shipping/orders` (P2 page-mode condensation).
 * Bare `/dashboard` and outbound lifecycle bookmarks 308 there (proxy + client).
 * Sales (`?mode=sales|pickup`) stays until the dedicated `/sales` desk pass (P3).
 */

import { Suspense, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { QueryClient } from '@tanstack/react-query';
import { BootGate } from '@/components/boot/BootGate';
import { BootSplash } from '@/components/boot/BootSplash';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { consumeBootSplash } from '@/lib/boot-flag';
import { warmActiveView } from '@/lib/queries/dashboard-warm';
import { DashboardSalesView } from '@/components/dashboard/DashboardSalesView';
import {
  RedirectDashboardOutboundToShippingOrders,
} from '@/components/outbound/orders/OutboundOrdersDesk';
import { buildSupportWarrantyRedirectSearch } from '@/utils/dashboard-search-state';
import {
  getDashboardDomainFromSearch,
  isRetiredFbaView,
  isRetiredSearchMode,
  retiredFbaViewTarget,
  retiredSearchModeTarget,
} from '@/lib/dashboard/dashboard-domains';

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const domain = getDashboardDomainFromSearch(searchParams);
  const searchModeRetired = isRetiredSearchMode(searchParams);
  const fbaViewRetired = isRetiredFbaView(searchParams);

  // Legacy Warranty Logger lived on `/dashboard?warranty=` — permanent home is
  // Support › Warranty. Preserve open claim + filters for bookmarks / e2e.
  useEffect(() => {
    if (!searchParams.has('warranty')) return;
    const qs = buildSupportWarrantyRedirectSearch(searchParams);
    router.replace(qs ? `/support?${qs}` : '/support?mode=warranty');
  }, [router, searchParams]);

  // Retired `?fba` lifecycle tab — FBA's home is `/shipping/fba`.
  useEffect(() => {
    if (!fbaViewRetired) return;
    router.replace(retiredFbaViewTarget());
  }, [router, fbaViewRetired]);

  // Retired Search mode (`?mode=search`).
  useEffect(() => {
    if (!searchModeRetired) return;
    router.replace(retiredSearchModeTarget(searchParams));
  }, [router, searchModeRetired, searchParams]);

  // Inbound desk moved to `/incoming?lane=docked` (proxy also 308s).
  useEffect(() => {
    if (domain !== 'inbound') return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('mode');
    next.set('lane', 'docked');
    const qs = next.toString();
    router.replace(qs ? `/incoming?${qs}` : '/incoming?lane=docked');
  }, [domain, router, searchParams]);

  if (searchParams.has('warranty') || searchModeRetired || fbaViewRetired || domain === 'inbound') {
    return <div className="flex h-full w-full bg-surface-canvas" aria-busy />;
  }

  // Sales (`?mode=sales` | `?mode=pickup`) — front-desk transaction history.
  if (domain === 'sales') {
    return (
      <div className="flex min-h-0 w-full flex-1">
        <DashboardSalesView />
      </div>
    );
  }

  // Bare outbound → `/shipping/orders` (proxy 308 + client fallback).
  return <RedirectDashboardOutboundToShippingOrders />;
}

function DashboardBootGate({ children }: { children: React.ReactNode }) {
  const prefetch = useCallback(
    (queryClient: QueryClient) => warmActiveView(queryClient, window.location.search),
    [],
  );
  return (
    <BootGate prefetch={prefetch} shouldHold={consumeBootSplash} splash={<BootSplash />}>
      {children}
    </BootGate>
  );
}

export default function DashboardPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <Suspense fallback={<BootSplash />}>
        <DashboardBootGate>
          <DashboardPageContent />
        </DashboardBootGate>
      </Suspense>
    </>
  );
}
