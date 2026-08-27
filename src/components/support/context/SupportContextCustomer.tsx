'use client';

import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { EmptyState } from '@/design-system/primitives';
import { Ticket } from '@/components/Icons';
import type { SupportContextBundle } from '@/lib/support/context-types';
import { TicketLinkPopover } from './TicketLinkPopover';
import { DashedLinkChip } from './LinkageStrip';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';

export function SupportContextCustomer({
  bundle,
  embedded = false,
  receivingId,
  onBridgeChange,
  onRequestLinkTicket,
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
   * Station hosts (Unbox / Testing) open {@link ReceivingClaimModal} on the
   * Link-existing tab. When set, the empty-state chip calls this instead of the
   * inline {@link TicketLinkPopover}.
   */
  onRequestLinkTicket?: () => void;
  hostComposer?: boolean;
  mergeFloorTimeline?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { has, isLoaded } = useAuth();
  const canZendesk = !isLoaded || has('integrations.zendesk');
  const ticketId = bundle.ticket?.providerTicketId;
  const canLink = Boolean(canZendesk && bundle.linkable?.canLinkTicket);
  const useStationClaimModal = typeof onRequestLinkTicket === 'function';

  if (ticketId == null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <EmptyState
          icon={<Ticket className="h-6 w-6 text-text-faint" />}
          title="No customer ticket linked"
          description="Link an existing ticket to see the conversation here."
        />
        {canLink && bundle.linkable ? (
          useStationClaimModal ? (
            <DashedLinkChip label="Link ticket" onClick={onRequestLinkTicket} />
          ) : (
            <div className="relative w-full max-w-sm">
              <div className="flex justify-center">
                <DashedLinkChip
                  label="Link ticket"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-expanded={pickerOpen}
                />
              </div>
              {pickerOpen ? (
                <div className="mt-2">
                  <TicketLinkPopover
                    linkable={bundle.linkable}
                    open={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                  />
                </div>
              ) : null}
            </div>
          )
        ) : null}
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
