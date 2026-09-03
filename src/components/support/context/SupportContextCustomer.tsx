'use client';

import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import type { SupportContextBundle } from '@/lib/support/context-types';
import { useAuth } from '@/contexts/AuthContext';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { SupportCreateTicketModal } from '@/components/support/service-workspace/SupportCreateTicketModal';
import { useSupportTicketClaimHost } from '@/components/support/service-workspace/useSupportTicketClaimHost';

export function SupportContextCustomer({
  bundle,
  embedded = false,
  receivingId,
  onBridgeChange,
  onRequestLinkTicket: _onRequestLinkTicket,
  /** Station host owns floating {@link SupportTicketComposerDock}. */
  hostComposer = false,
  /**
   * Floor spine in the ticket stream. Station Ticket Displays leave this
   * false — Timeline is a peer Displays tab.
   */
  mergeFloorTimeline = false,
}: {
  bundle: SupportContextBundle;
  embedded?: boolean;
  receivingId?: number;
  onBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  /**
   * Kept for station callers. Empty state is create-only (no Link combobox).
   */
  onRequestLinkTicket?: () => void;
  hostComposer?: boolean;
  mergeFloorTimeline?: boolean;
}) {
  const { has, isLoaded } = useAuth();
  const canZendesk = !isLoaded || has('integrations.zendesk');
  const ticketId = bundle.ticket?.providerTicketId;
  const claim = useSupportTicketClaimHost();

  if (ticketId == null) {
    const orderNumber = bundle.linkage.order?.orderId ?? null;
    const trackingNumber = bundle.linkage.trackings.find((t) => t.isPrimary)?.tracking
      ?? bundle.linkage.trackings[0]?.tracking
      ?? null;
    const serialNumber = bundle.linkage.serials[0]?.serial ?? null;
    if (!canZendesk) {
      return (
        <div className="flex flex-1 flex-col bg-surface-card p-6 text-text-default">
          <p className="text-role-caption text-text-muted">Helpdesk isn’t connected.</p>
        </div>
      );
    }
    return (
      <div
        className="flex h-full min-h-0 flex-1 flex-col bg-surface-card text-text-default"
        data-testid="support-create-ticket-empty"
      >
        <SupportCreateTicketModal
          open
          surface="inline"
          defaultSubject={orderNumber ? `Order #${orderNumber}` : undefined}
          defaultOrderNumber={orderNumber}
          defaultTrackingNumber={trackingNumber}
          defaultSerialNumber={serialNumber}
          submitting={claim.createTicket.isPending}
          onClose={() => undefined}
          onCreate={({ subject, note, linkages }) =>
            claim.createTicket.mutate({ subject, note, linkages })
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SupportTicketDetail
        ticketId={ticketId}
        hideExternalLink
        embedded={embedded}
        receivingId={receivingId ?? bundle.linkable?.receivingId ?? undefined}
        hideLinkedContext
        onComposerBridgeChange={hostComposer ? undefined : onBridgeChange}
        composerPlacement={hostComposer ? 'host' : 'inline'}
        mergeFloorTimeline={mergeFloorTimeline}
      />
    </div>
  );
}
