'use client';

import dynamic from 'next/dynamic';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState } from '@/design-system/primitives';

import { capabilityNoun } from '@/lib/integrations/capability-labels';
import { parseSupportMode } from '@/components/sidebar/support/support-sidebar-shared';
import { VoicemailQueue } from '@/components/support/voice/VoicemailQueue';
import { VoicemailDetail } from '@/components/support/voice/VoicemailDetail';
import { CallLogView } from '@/components/support/voice/CallLogView';
import { IssuesWorkspace } from '@/components/support/issues/IssuesWorkspace';
import { SupportOrdersWorkspace } from '@/components/support/orders/SupportOrdersWorkspace';
import { useSupportVmParam } from '@/hooks/useSupportVmParam';
import { SupportTicketsWorkspace } from './SupportTicketsWorkspace';

const WarrantyWorkspace = dynamic(
  () => import('@/components/warranty/WarrantyWorkspace').then((m) => m.WarrantyWorkspace),
  {
    ssr: false,
    loading: () => <div className="flex-1 bg-surface-canvas" aria-hidden />,
  },
);

/** /support page body. */
export function SupportWorkspace() {
  const { has, isLoaded } = useAuth();
  const searchParams = useSearchParams();
  const mode = parseSupportMode(searchParams.get('mode'));
  const { vmId, setVm } = useSupportVmParam();

  const canTickets = !isLoaded || has('integrations.zendesk');
  const canOrders = !isLoaded || has('orders.view');
  const canWarranty = !isLoaded || has('warranty.view');
  const canIssues = !isLoaded || has('support.issues.view');

  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair so the presence can never drift onto another job's timing.
  const { presence: paneMotion, transition: paneTransition } = useMotionRole(motionRole.swap.focus);

  if (isLoaded && !canTickets && !canWarranty && !canIssues && !canOrders) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          title="No access to Support"
          description={`You need ${capabilityNoun('helpdesk')} ticket access, orders, warranty, or reported-issues permissions to use the support console.`}
        />
      </div>
    );
  }

  // ── Orders — Dashboard To Ship board + Station order focus ─────────────────
  if (mode === 'orders') {
    if (isLoaded && !canOrders) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="No access to Orders"
            description="You need the “View orders” permission."
          />
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 w-full bg-surface-canvas">
        <SupportOrdersWorkspace />
      </div>
    );
  }

  // ── Issues — Workbench + Monitor KPI rollup ────────────────────────────────
  if (mode === 'issues') {
    if (isLoaded && !canIssues) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="No access to Issues"
            description="You need the “View reported issues console” permission."
          />
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 w-full bg-surface-canvas">
        <IssuesWorkspace />
      </div>
    );
  }

  // ── Warranty — Workbench (coverage lookup + claims + detail) ───────────────
  if (mode === 'warranty') {
    if (isLoaded && !canWarranty) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="No access to Warranty"
            description="You need the “View warranty claims” permission to open the warranty logger."
          />
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 w-full bg-surface-canvas">
        <WarrantyWorkspace />
      </div>
    );
  }

  // ── Calls — Monitor (read-only stream; no durable selection) ───────────────
  if (mode === 'calls') {
    return (
      <div className="flex h-full min-h-0 w-full bg-surface-canvas">
        <CallLogView />
      </div>
    );
  }

  // ── Voicemail — Workbench (pick → detail; crossfade the pane) ──────────────
  if (mode === 'voicemail') {
    return (
      <div className="flex h-full min-h-0 w-full bg-surface-canvas">
        {vmId == null ? (
          <div className="flex h-full w-full flex-col bg-surface-card">
            <VoicemailQueue />
          </div>
        ) : (
          <div className="flex h-full min-h-0 w-full flex-col">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`vm-${vmId}`}
                className="flex h-full min-h-0 w-full flex-col"
                initial={paneMotion.initial}
                animate={paneMotion.animate}
                exit={paneMotion.exit}
                transition={paneTransition}
              >
                <VoicemailDetail voicemailId={vmId} onBack={() => setVm(null)} />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }

  // Tickets require Zendesk — warranty/issues-only users should not see the empty queue.
  if (isLoaded && !canTickets) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          title="No access to tickets"
          description={`Switch to Issues or Warranty in the mode rail, or ask for ${capabilityNoun('helpdesk')} ticket permission.`}
        />
      </div>
    );
  }

  // ── Tickets — workbench board + Station focus (Orders/Unbox recipe) ─────────
  return (
    <div className="flex h-full min-h-0 w-full bg-surface-canvas">
      <SupportTicketsWorkspace />
    </div>
  );
}
