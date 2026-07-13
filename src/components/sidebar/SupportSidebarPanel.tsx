'use client';

import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useMasterNavEnabled } from '@/components/sidebar/master-nav/MasterNavContext';
import { SupportTicketQueue } from '@/components/support/zendesk/queue/SupportTicketQueue';
import { VoicemailQueue } from '@/components/support/voice/VoicemailQueue';
import { CallLogSidebar } from '@/components/support/voice/CallLogSidebar';
import { WarrantyLoggerSidebar } from '@/components/warranty/WarrantyLoggerSidebar';
import { SupportModeToggle } from '@/components/sidebar/support/SupportModeToggle';
import type { SupportMode } from '@/components/sidebar/support/support-sidebar-shared';
import { useSupportMode } from '@/components/sidebar/support/useSupportMode';

/**
 * Contextual sidebar for /support. Four modes (the house sidebar-mode
 * contract, `?mode=` is the single source of truth):
 *
 * - tickets   → Zendesk ticket queue → conversation (Workbench; the default).
 * - voicemail → voicemail / missed-call follow-up to-do list (Workbench);
 *   selecting one sets `?vm=<id>` for the page body.
 * - calls     → org call log filter rail (Monitor); the stream lives in the body.
 * - warranty  → Warranty Logger claim picker + search (Workbench); body shows
 *   coverage card + claims table + claim detail (`?open=`).
 *
 * The mode rail is suppressed when the master-nav drives mode switching
 * (`support` is in MASTER_NAV_RAIL_PAGES) — same gate Operations uses.
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
  const canWarranty = !isLoaded || has('warranty.view');

  // Other surfaces still fire 'support-refresh' to invalidate the caches.
  useEffect(() => {
    const onRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['zendesk'] });
      void queryClient.invalidateQueries({ queryKey: ['voicemails'] });
      void queryClient.invalidateQueries({ queryKey: ['call-events'] });
      void queryClient.invalidateQueries({ queryKey: ['warranty-claims'] });
      void queryClient.invalidateQueries({ queryKey: ['warranty-coverage'] });
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

  if (isLoaded && !canTickets && !canWarranty) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-role-caption font-semibold text-text-soft">
        Requires support tickets or warranty access.
      </div>
    );
  }

  // Warranty-only staff land on warranty mode when they hit bare /support.
  useEffect(() => {
    if (!isLoaded) return;
    if (mode === 'tickets' && !canTickets && canWarranty) {
      updateMode('warranty');
    }
  }, [canTickets, canWarranty, isLoaded, mode, updateMode]);

  const modeToggle = masterNavEnabled ? null : (
    <SupportModeToggle value={mode} onChange={(id) => updateMode(id as SupportMode)} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card">
      {mode === 'warranty' ? (
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
      ) : mode === 'voicemail' ? (
        <VoicemailQueue modeToggle={modeToggle} />
      ) : mode === 'calls' ? (
        <CallLogSidebar modeToggle={modeToggle} />
      ) : (
        <SupportTicketQueue modeToggle={modeToggle} />
      )}
    </div>
  );
}
