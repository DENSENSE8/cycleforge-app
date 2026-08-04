'use client';

/**
 * Support · Tickets THREAD — the focus surface of the Workbench branch
 * `service-workspace` (`.claude/rules/display/workbench-service.md`).
 *
 *   SupportTicketPaneHeader → split header: icon action row over dense identity
 *   body                    → the customer conversation, and nothing else
 *   dock                    → SupportTicketComposerDock (OmnichannelComposerDock + Reply)
 *
 * ## The middle holds ONE thing (2026-08-02)
 *
 * It used to mount a `SectionTabsSlider` here — Ticket | Conversations |
 * Timeline — so reading the linkage or the history meant swapping the
 * conversation off screen on the surface whose whole job is that conversation.
 * The displays moved to the right edge ({@link useSupportTicketDisplays} →
 * `SupportContextDetailPanel`), which is the shape Unbox already ships: the
 * workbench body is the work, every other display is a thing the operator picks
 * on the right and which then persists (`display/station-workbench.md`).
 *
 * The dock followed from that and is now **ticket-terminal**: it is always the
 * reply composer, never re-labelled by a click on the right edge. A control in
 * one region rewriting a control in another is the cross-region
 * action-at-a-distance the station law bans; `resolveSupportTerminal` still
 * understands the other tab ids because it is a resolver, not a tab registry.
 *
 * **It wore Unbox-family Station chrome until 2026-08-01** — `StationContextBar`
 * + `StationMoreDetails` + `StationWorkbench` + `StationAmbientWash`. That is the
 * carton-bench anatomy: built for a scanner-driven operator holding one transient
 * unit, with reserved identity clearance and a terminal dock whose primary action
 * completes the unit and clears it. A ticket is none of those things — it
 * persists, it is assigned, it is returned to. The clearest evidence was already
 * in the guard: `SupportTicketIdentity` had to be allowlisted as the one
 * sanctioned identity fork *because a ticket is not a carton*.
 *
 * The crossfade and `AnimatePresence` belong to `ServiceWorkspaceShell`; this
 * component renders the record and does not animate itself.
 */

import { useMemo } from 'react';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { STATION_TERMINAL_SCROLL_CLEARANCE } from '@/components/station/terminal';
import { WorkspaceCard } from '@/design-system/components';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useSupportContext } from '@/hooks/useSupportContext';
import type { TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import { capabilityTitle } from '@/lib/integrations/capability-labels';
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
  /** Whether the `RightRailHost` currently holds this ticket's displays. */
  contextOpen: boolean;
  onToggleContext: () => void;
  /**
   * The composer bridge, OWNED BY THE WORKSPACE rather than by this component.
   * The rail's Assist display drafts into the same composer the dock commits,
   * and the rail is mounted as a sibling of this pane — so the one piece of
   * state both need lives in their common parent. Holding it here and pushing
   * it sideways would be two owners of one composer.
   */
  ticketBridge: ThreadComposerBridge | null;
  onBridgeChange: (bridge: ThreadComposerBridge | null) => void;
  /**
   * Resolved by the workspace, not re-derived here. The staged photos, the
   * composer and the drafting route must agree on which ticket they mean, and
   * three copies of `bundle?.providerTicketId ?? ticketId` is three chances to
   * disagree.
   */
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

  // Paste an image ANYWHERE on the open ticket. Document scope, because the
  // operator has usually just clicked a message, not the composer — and this
  // component only mounts while a ticket is open, so nothing claims paste on
  // the queue. The thread body's own dropzone runs with `paste: false` so one
  // gesture keeps one meaning.
  usePhotoDropzone(onPasteImages, { documentPaste: true });
  const receivingId = contextBundle?.linkable?.receivingId ?? undefined;

  // Ticket-terminal: one dock, one meaning, on every display the rail shows.
  const terminalVm = useMemo(
    () => resolveSupportTerminal({ tabId: 'ticket', ticketBridge }),
    [ticketBridge],
  );

  // Deep-link + label resolve from the bundle's runtime provider (vendor-neutral);
  // fall back to the connector URL + generic capability title while it loads.
  const openUrl = ticket?.openUrl ?? zendeskTicketUrl(ticketId);
  const providerLabel = ticket?.providerLabel ?? capabilityTitle('helpdesk');
  const openLabel = `Open in ${providerLabel}`;

  return (
    <TicketComposerStagingProvider value={photoStaging}>
      <div className="relative isolate flex h-full min-h-0 w-full flex-col bg-surface-canvas">
        {/* Same gutter column the queue board's chrome uses, so flipping between
            the two does not shift the card edge sideways. */}
        <div className={WORKBENCH_CHROME_COLUMN}>
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

        {/* The conversation fills the column and owns its own scroll — a thread
            has to be able to rest at its newest message. The dock floats over
            this canvas, so the body reserves its clearance rather than letting
            the composer cover the last reply. */}
        <div
          className={cn(
            WORKBENCH_BODY_COLUMN,
            'min-h-0 flex-1 pb-0',
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
              ticketId={ticketId}
              onBack={onClose}
              embedded
              hideExternalLink
              // The split header above already carries the subject; drawing it
              // again here was the duplicate.
              hideTitle
              // …and the chat header's one-line requester is superseded by the
              // RequesterDetailBand below, which answers the same question with
              // the linkage and the counts attached. With the title gone too,
              // SupportChatHeader has nothing left to draw and renders null.
              hideRequesterBand
              showRequesterDetail
              // Linkage is a rail display now, so the chat header's own
              // Links control and slide-over stay off.
              hideLinkedContext
              composerPlacement="host"
              receivingId={receivingId}
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
