'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { SupportTicketsRecentRail } from '@/components/support/zendesk/queue/SupportTicketsRecentRail';
import { useSupportMode } from '@/components/sidebar/support/useSupportMode';

/**
 * Contextual sidebar for /support. The only left column this desk keeps is
 * Tickets recents — other modes are rail-less (`isRaillessSurface`) and pick
 * from the stage. This panel therefore always mounts the recent dock; the
 * shell simply does not reserve a column when mode is not tickets.
 */
export function SupportSidebarPanel() {
  const { has, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const { mode, updateMode } = useSupportMode();

  const canTickets = !isLoaded || has('integrations.zendesk');
  const canOrders = !isLoaded || has('orders.view');
  const canWarranty = !isLoaded || has('warranty.view');
  const canIssues = !isLoaded || has('support.issues.view');

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

  if (isLoaded && !canTickets && !canWarranty && !canIssues && !canOrders) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-role-caption font-semibold text-text-soft">
        Requires support tickets, orders, warranty, or reported-issues access.
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${appChromeClass}`}>
      <SupportTicketsRecentRail />
    </div>
  );
}
