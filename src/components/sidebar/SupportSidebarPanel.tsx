'use client';

import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useMasterNavEnabled } from '@/components/sidebar/master-nav/MasterNavContext';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { SupportTicketsRecentRail } from '@/components/support/zendesk/queue/SupportTicketsRecentRail';
import { VoicemailQueue } from '@/components/support/voice/VoicemailQueue';
import { CallLogSidebar } from '@/components/support/voice/CallLogSidebar';
import { WarrantyLoggerSidebar } from '@/components/warranty/WarrantyLoggerSidebar';
import { IssuesQueue } from '@/components/support/issues/IssuesQueue';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { SupportModeToggle } from '@/components/sidebar/support/SupportModeToggle';
import type { SupportMode } from '@/components/sidebar/support/support-sidebar-shared';
import { useSupportMode } from '@/components/sidebar/support/useSupportMode';

/**
 * Contextual sidebar for /support. Modes (the house sidebar-mode contract,
 * `?mode=` is the single source of truth):
 *
 * - tickets   → recently selected dock only; full queue + status tabs live in
 *   the right-pane workbench (`SupportTicketsBoard` / `?ticket=` focus).
 * - orders    → To Ship filter map (UnshippedSidebar SoT); body is OrdersQueueTable board.
 * - voicemail → voicemail / missed-call follow-up to-do list (Workbench);
 *   selecting one sets `?vm=<id>` for the page body.
 * - calls     → org call log filter rail (Monitor); the stream lives in the body.
 * - warranty  → Warranty Logger claim picker + search (Workbench); body shows
 *   coverage card + claims table + claim detail (`?open=`).
 * - issues    → Reported-Issues list (Workbench); selecting one sets `?issueId=`.
 *
 * Panel-local mode pills are suppressed when the master-nav drives switching
 * (`useMasterNavEnabled`) — same gate Operations uses.
 */
export function SupportSidebarPanel() {
  const { has, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const { mode, updateMode } = useSupportMode();
  const masterNavEnabled = useMasterNavEnabled();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canTickets = !isLoaded || has('integrations.zendesk');
  const canOrders = !isLoaded || has('orders.view');
  const canWarranty = !isLoaded || has('warranty.view');
  const canIssues = !isLoaded || has('support.issues.view');

  // Other surfaces still fire 'support-refresh' to invalidate the caches.
  useEffect(() => {
    const onRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['zendesk'] });
      void queryClient.invalidateQueries({ queryKey: ['voicemails'] });
      void queryClient.invalidateQueries({ queryKey: ['call-events'] });
      void queryClient.invalidateQueries({ queryKey: ['warranty-claims'] });
      void queryClient.invalidateQueries({ queryKey: ['warranty-coverage'] });
      void queryClient.invalidateQueries({ queryKey: ['user-issues'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'unshipped'] });
      void queryClient.invalidateQueries({ queryKey: ['support-order-detail'] });
    };
    window.addEventListener('support-refresh', onRefresh);
    return () => window.removeEventListener('support-refresh', onRefresh);
  }, [queryClient]);

  const warrantySearch = String(searchParams.get('search') || '');
  const setWarrantySearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/support'}?${qs}` : pathname || '/support', {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const ordersSearch = String(searchParams.get('search') || '');
  const setOrdersSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', 'orders');
      const trimmed = value.trim();
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      params.delete('openOrderId');
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/support'}?${qs}` : `${pathname || '/support'}?mode=orders`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  if (isLoaded && !canTickets && !canWarranty && !canIssues && !canOrders) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-role-caption font-semibold text-text-soft">
        Requires support tickets, orders, warranty, or reported-issues access.
      </div>
    );
  }

  // Non-ticket staff land on the first mode they can open when they hit bare /support.
  useEffect(() => {
    if (!isLoaded) return;
    if (mode === 'tickets' && !canTickets) {
      if (canOrders) updateMode('orders');
      else if (canIssues) updateMode('issues');
      else if (canWarranty) updateMode('warranty');
    }
    if (mode === 'orders' && !canOrders) {
      if (canTickets) updateMode('tickets');
      else if (canIssues) updateMode('issues');
      else if (canWarranty) updateMode('warranty');
    }
  }, [canTickets, canOrders, canWarranty, canIssues, isLoaded, mode, updateMode]);

  const modeToggle = masterNavEnabled ? null : (
    <SupportModeToggle value={mode} onChange={(id) => updateMode(id as SupportMode)} />
  );

  return (
    <div className={`flex h-full min-h-0 flex-col ${appChromeClass}`}>
      {mode === 'orders' ? (
        canOrders ? (
          <UnshippedSidebar
            embedded
            hideSectionHeader
            filterControl={modeToggle}
            searchValue={ordersSearch}
            onSearchChange={setOrdersSearch}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-role-caption font-semibold text-text-soft">
            Requires the “View orders” permission.
          </div>
        )
      ) : mode === 'warranty' ? (
        canWarranty ? (
          <WarrantyLoggerSidebar
            filterControl={modeToggle}
            searchValue={warrantySearch}
            onSearchChange={setWarrantySearch}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-role-caption font-semibold text-text-soft">
            Requires the “View warranty claims” permission.
          </div>
        )
      ) : mode === 'issues' ? (
        canIssues ? (
          <IssuesQueue modeToggle={modeToggle} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-role-caption font-semibold text-text-soft">
            Requires the “View reported issues console” permission.
          </div>
        )
      ) : mode === 'voicemail' ? (
        <VoicemailQueue modeToggle={modeToggle} />
      ) : mode === 'calls' ? (
        <CallLogSidebar modeToggle={modeToggle} />
      ) : (
        <SupportTicketsRecentRail modeToggle={modeToggle} />
      )}
    </div>
  );
}
