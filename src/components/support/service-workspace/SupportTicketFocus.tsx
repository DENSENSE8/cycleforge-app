'use client';

/**
 * Support · Tickets THREAD — the focus surface of the Workbench branch
 * `service-workspace` (`.claude/rules/display/workbench-service.md`).
 *
 *   PaneHeader        → dense identity (SupportTicketIdentity) + icon actions
 *   tabs              → Ticket | Conversations | Timeline
 *   Ticket tab dock   → SupportTicketComposerDock (OmnichannelComposerDock + Reply)
 *   Other tabs        → StationTerminalDock (tab-aware SlicedActionDock)
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
 * Connections moved out of the tab strip into the right push column — linkage is
 * context beside the conversation, not a view you swap the conversation out for.
 *
 * The crossfade and `AnimatePresence` belong to `ServiceWorkspaceShell` now; this
 * component renders the record and does not animate itself.
 */

import { useMemo, useState } from 'react';
import { ExternalLink } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { SectionTabsSlider } from '@/design-system/components';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PaneHeader, PaneHeaderCloseButton } from '@/components/ui/pane-header';
import { StationTerminalDock } from '@/components/station/terminal';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { useSupportContext } from '@/hooks/useSupportContext';
import { useTicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import type { WorkspaceTimelineAnchor } from '@/components/station/workbench';
import { capabilityTitle } from '@/lib/integrations/capability-labels';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { SupportDetailsStack } from '@/components/support/zendesk/chat/SupportDetailsStack';
import { SupportTicketComposerDock } from '@/components/support/zendesk/chat/SupportTicketComposerDock';
import { TicketComposerStagingProvider } from '@/components/support/zendesk/chat/TicketComposerStagingContext';
import { requesterFrom } from '@/components/support/zendesk/chat/support-chat-utils';
import { SupportTicketIdentity } from './SupportTicketIdentity';
import { buildSupportTicketTabs } from './support-ticket-tabs';
import { resolveSupportTerminal } from './resolve-support-terminal';

type SupportTicketView = 'ticket' | 'connections' | 'conversations' | 'timeline';

export function SupportTicketFocus({
  ticketId,
  onClose,
}: {
  ticketId: number;
  onClose: () => void;
}) {
  // Default to the conversation — the operator's primary work on a ticket.
  const [view, setView] = useState<SupportTicketView>('ticket');
  const [ticketBridge, setTicketBridge] = useState<ThreadComposerBridge | null>(null);
  const [conversationBridge, setConversationBridge] = useState<ThreadComposerBridge | null>(
    null,
  );

  const anchor = useMemo(() => ({ ticket: String(ticketId) }), [ticketId]);
  const { data: contextBundle } = useSupportContext(anchor, true);
  const ticket = contextBundle?.ticket ?? null;

  // Live Zendesk ticket for the top-right details stack (same query cache as Ticket tab).
  const providerTicketId = ticket?.providerTicketId ?? ticketId;
  const { data: liveBundle } = useZendeskTicketBundle(providerTicketId);
  const liveTicket = liveBundle?.ticket ?? null;

  // Host-owned staging — shared by Ticket tab dropzone + floating composer dock.
  const photoStaging = useTicketPhotoStaging(providerTicketId);
  const requesterEmail = liveTicket ? requesterFrom(liveTicket).email : null;

  // Derive the Timeline tab anchor (Unbox WorkspaceTimelineTab + Activity spine).
  const timelineAnchor = useMemo<WorkspaceTimelineAnchor>(() => {
    const linkage = contextBundle?.linkage;
    const primaryTracking =
      linkage?.trackings.find((t) => t.isPrimary)?.tracking ??
      linkage?.trackings[0]?.tracking ??
      null;
    return {
      orderId: linkage?.order?.orderId ?? null,
      tracking: primaryTracking,
      serials: (linkage?.serials ?? []).map((s) => s.serial).filter(Boolean),
      receivingId: contextBundle?.linkable?.receivingId ?? null,
      activity: {
        items: contextBundle?.timeline ?? [],
        loading: !contextBundle,
      },
    };
  }, [contextBundle]);

  const primaryTracking = timelineAnchor.tracking ?? null;
  const receivingId = contextBundle?.linkable?.receivingId ?? undefined;

  const tabs = useMemo(
    () =>
      buildSupportTicketTabs({
        ticketId,
        anchor,
        timelineAnchor,
        onBack: onClose,
        onComposerBridgeChange: setTicketBridge,
        onConversationBridgeChange: setConversationBridge,
        hostComposer: true,
      }),
    [ticketId, anchor, timelineAnchor, onClose],
  );

  const activeView: SupportTicketView = tabs.some((t) => t.id === view)
    ? view
    : ((tabs[0]?.id as SupportTicketView) ?? 'ticket');

  const terminalVm = useMemo(
    () =>
      resolveSupportTerminal({
        tabId: activeView,
        ticketBridge,
        conversationBridge,
        tracking: primaryTracking,
      }),
    [activeView, ticketBridge, conversationBridge, primaryTracking],
  );

  // Deep-link + label resolve from the bundle's runtime provider (vendor-neutral);
  // fall back to the connector URL + generic capability title while it loads.
  const openUrl = ticket?.openUrl ?? zendeskTicketUrl(ticketId);
  const providerLabel = ticket?.providerLabel ?? capabilityTitle('helpdesk');
  const openLabel = `Open in ${providerLabel}`;

  const ticketDock =
    activeView === 'ticket' ? (
      <SupportTicketComposerDock
        host={{
          ticketId: providerTicketId,
          requesterEmail,
          staging: photoStaging,
          receivingId,
        }}
        terminalVm={terminalVm}
        onBridgeChange={setTicketBridge}
      />
    ) : (
      <StationTerminalDock vm={terminalVm} />
    );

  return (
    <TicketComposerStagingProvider value={photoStaging}>
      <div className="relative isolate flex h-full min-h-0 w-full flex-col bg-surface-canvas">
        <PaneHeader
          leftSlot={<SupportTicketIdentity ticket={ticket} fallbackId={ticketId} />}
          rightSlot={
            <>
              {openUrl ? (
                <HoverTooltip label={openLabel}>
                  <IconButton
                    size="sm"
                    icon={<ExternalLink className="h-3.5 w-3.5" />}
                    ariaLabel={openLabel}
                    onClick={() => window.open(openUrl, '_blank', 'noopener')}
                  />
                </HoverTooltip>
              ) : null}
              {liveTicket ? <SupportDetailsStack ticket={liveTicket} density="station" /> : null}
              {/* Mandatory: a non-modal push surface has no scrim to click off. */}
              <PaneHeaderCloseButton
                onClick={onClose}
                ariaLabel="Back to tickets queue"
                title="Back to tickets queue"
              />
            </>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-6 pt-2">
          <SectionTabsSlider
            tabs={tabs}
            value={activeView}
            onChange={(id) => setView(id as SupportTicketView)}
            ariaLabel="Ticket displays"
          />
        </div>

        {ticketDock}
      </div>
    </TicketComposerStagingProvider>
  );
}
