'use client';

/** Dashboard page — Sales domain host + legacy outbound redirect shell. */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DashboardSalesView } from '@/components/dashboard/DashboardSalesView';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import {
  RedirectDashboardOutboundToShippingOrders,
} from '@/components/outbound/orders/OutboundOrdersDesk';
import { supportHref } from '@/lib/nav/route-tree';
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

  // The retired warranty console no longer has a parallel support surface.
  useEffect(() => {
    if (!searchParams.has('warranty')) return;
    router.replace(supportHref());
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

  // Sales (`?mode=sales` | `?mode=pickup` | `?mode=repairs`) — front-desk transaction history, wearing the one page frame…
  // Repair service's views wear the NavContext header (`bare`: the view as the title, `›` unfolding them) like `/repair`.
  if (domain === 'sales') {
    return (
      <DeskPageLayout bare={searchParams.get('mode') === 'repairs'} className="h-full">
        <div className="flex min-h-0 w-full flex-1">
          <DashboardSalesView />
        </div>
      </DeskPageLayout>
    );
  }

  // Bare outbound → `/shipping/orders` (proxy 308 + client fallback).
  return <RedirectDashboardOutboundToShippingOrders />;
}

export default function DashboardPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <Suspense fallback={null}>
        <DashboardPageContent />
      </Suspense>
    </>
  );
}
