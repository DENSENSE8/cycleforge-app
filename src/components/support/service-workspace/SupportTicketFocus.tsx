'use client';

/** Support · Tickets THREAD — the focus surface of the Workbench branch `service-workspace`. */

import { useMemo } from 'react';
import { STATION_TERMINAL_SCROLL_CLEARANCE } from '@/components/station/terminal';
import { WorkspaceCard } from '@/design-system/components';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useSupportContext } from '@/hooks/useSupportContext';
import type { TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { cn } from '@/utils/_cn';
import { SupportDetailsStack } from '@/components/support/zendesk/chat/SupportDetailsStack';
import { SupportTicketComposerDock } from '@/components/support/zendesk/chat/SupportTicketComposerDock';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { TicketComposerStagingProvider } from '@/components/support/zendesk/chat/TicketComposerStagingContext';
import { requesterFrom } from '@/components/support/zendesk/chat/support-chat-utils';
import { SupportTicketPaneHeader } from './SupportTicketPaneHeader';
import { resolveSupportTerminal } from './resolve-support-terminal';

export function SupportTicketFocus({
  ticketId,
  onClose,
  contextOpen,
  onToggleContext,
  ticketBridge,
  onBridgeChange,
  providerTicketId,
  photoStaging,
  onPasteImages,
}: {
  ticketId: number;
  onClose: () => void;
  /** Whether the `RightRailHost` inspector currently holds this ticket's context. */
  contextOpen: boolean;
  onToggleContext: () => void;
  /** The composer bridge, OWNED BY THE WORKSPACE rather than by this component. */
  ticketBridge: ThreadComposerBridge | null;
  onBridgeChange: (bridge: ThreadComposerBridge | null) => void;
  /** Resolved by the workspace, not re-derived here. */
  providerTicketId: number;
  /**
   * Photo staging, owned by the workspace — the paste lands here and the draft
   * is prepared in the rail, and the two are siblings.
   */
  photoStaging: TicketPhotoStaging;
  /**
   * An image was pasted onto this surface. The host stages it AND asks the rail
   * for a draft; this component only reports the gesture.
   */
  onPasteImages: (files: File[]) => void;
}) {

  const anchor = useMemo(() => ({ ticket: String(ticketId) }), [ticketId]);
  const { data: contextBundle } = useSupportContext(anchor, true);
  const ticket = contextBundle?.ticket ?? null;

  // Live helpdesk ticket for the top-right details stack (same query cache as
  // the conversation below).
  const { data: liveBundle } = useZendeskTicketBundle(providerTicketId);
  const liveTicket = liveBundle?.ticket ?? null;

  const requesterEmail = liveTicket ? requesterFrom(liveTicket).email : null;

  // Paste an image ANYWHERE on the open ticket.
  usePhotoDropzone(onPasteImages, { documentPaste: true });
  const receivingId = contextBundle?.linkable?.receivingId ?? undefined;

  // Ticket-terminal: one dock, one meaning, on every display the rail shows.
  const terminalVm = useMemo(
    () => resolveSupportTerminal({ tabId: 'ticket', ticketBridge }),
    [ticketBridge],
  );

  // Deep-link + runtime provider face — connected helpdesk label (Zendesk),
  // never the generic capability title ("Helpdesk") when a connector is live.
  const openUrl = ticket?.openUrl ?? zendeskTicketUrl(ticketId);
  const { label: helpdeskLabel } = useCapabilityProviderLabel('helpdesk');
  const openLabel = `Open in ${ticket?.providerLabel ?? helpdeskLabel}`;

  return (
    <TicketComposerStagingProvider value={photoStaging}>
      <div className="relative isolate flex h-full min-h-0 w-full flex-col bg-surface-canvas">
        {/* Flush chrome plane — matches the now-flush queue board so flipping between list and thread does not shift the card edge sideways. */}
        <div className="relative w-full min-w-0">
          <SupportTicketPaneHeader
            ticket={ticket}
            ticketId={ticketId}
            openUrl={openUrl}
            openLabel={openLabel}
            contextOpen={contextOpen}
            onToggleContext={onToggleContext}
            onClose={onClose}
            detailsSlot={
              liveTicket ? <SupportDetailsStack ticket={liveTicket} density="station" /> : null
            }
          />
        </div>

        {/* The conversation fills the column and owns its own scroll — a thread has to be able to rest at its newest message. */}
        <div
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 flex-col pb-0',
            STATION_TERMINAL_SCROLL_CLEARANCE,
          )}
        >
          <WorkspaceCard
            variant="glass"
            overflow="hidden"
            className="flex min-h-0 flex-1 flex-col"
            bodyClassName="flex min-h-0 flex-1 flex-col p-0"
          >
            <SupportTicketDetail
              // The PROVIDER id, not the `?ticket=` value.
              ticketId={providerTicketId}
              onBack={onClose}
              embedded
              hideExternalLink
              // The split header above already carries the subject; drawing it
              // again here was the duplicate.
              hideTitle
              // Requester banner deleted — linkage / counts live in the
              // inspector (Connections). Chat header stays null with both
              // title + requester band hidden.
              hideRequesterBand
              // Linkage is a rail display now, so the chat header's own
              // Links control and slide-over stay off.
              hideLinkedContext
              composerPlacement="host"
              receivingId={receivingId}
              // Support focus has no peer Timeline Displays tab yet — keep the
              // optional floor merge here. Station Ticket Displays stay
              // messages-only (default).
              mergeFloorTimeline
            />
          </WorkspaceCard>
        </div>

        <SupportTicketComposerDock
          host={{
            ticketId: providerTicketId,
            requesterEmail,
            staging: photoStaging,
            receivingId,
          }}
          terminalVm={terminalVm}
          onBridgeChange={onBridgeChange}
        />
      </div>
    </TicketComposerStagingProvider>
  );
}
