'use client';

/**
 * Support · Tickets focus pane — Unbox / Testing Station Workbench anatomy for a
 * selected ticket (`?ticket=`). Mirrors `SupportOrdersWorkspace`'s
 * `SupportOrderFocus` (compose, don't fork): StationContextBar identity +
 * StationWorkbench tabs + ambient wash + floating terminal dock.
 *
 *   StationContextBar → SupportTicketIdentity (subject + right last-4 id)
 *   StationMoreDetails → Open in provider · Ticket details · Close
 *   StationWorkbench  → Ticket | Connections | Conversations | Timeline
 *   StationTerminalDock → tab-aware SlicedActionDock (Ticket / Conversations / Timeline)
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { SectionTabsSlider } from '@/design-system/components';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { StationWorkbench } from '@/components/station/workbench';
import {
  StationContextBar,
  StationMoreDetails,
} from '@/components/station/entity-context';
import { StationTerminalDock } from '@/components/station/terminal';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { useSupportContext } from '@/hooks/useSupportContext';
import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import type { WorkspaceTimelineAnchor } from '@/components/station/workbench';
import { capabilityTitle } from '@/lib/integrations/capability-labels';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { SupportDetailsStack } from '@/components/support/zendesk/chat/SupportDetailsStack';
import { SupportTicketIdentity } from './SupportTicketIdentity';
import { buildSupportStationTabs } from './support-station-tabs';
import { resolveSupportTerminal } from './resolve-support-terminal';

type SupportTicketView = 'ticket' | 'connections' | 'conversations' | 'timeline';

export function SupportTicketFocus({
  ticketId,
  onClose,
}: {
  ticketId: number;
  onClose: () => void;
}) {
  const paneMotion = useMotionPresence(framerPresence.workbenchPane);
  const paneTransition = useMotionTransition(framerTransition.workbenchPaneMount);
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

  const tabs = useMemo(
    () =>
      buildSupportStationTabs({
        ticketId,
        anchor,
        timelineAnchor,
        onBack: onClose,
        onComposerBridgeChange: setTicketBridge,
        onConversationBridgeChange: setConversationBridge,
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

  return (
    <motion.div
      key={ticketId}
      className="relative isolate flex h-full min-h-0 w-full flex-col bg-surface-canvas"
      initial={paneMotion.initial}
      animate={paneMotion.animate}
      exit={paneMotion.exit}
      transition={paneTransition}
    >
      {/* Ambient wash covers identity + body — same Testing / Unbox depth language. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-visible">
        <div className="absolute -top-24 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-blue-400/[0.08] blur-3xl" />
        <div className="absolute right-[-7rem] top-1/3 h-80 w-80 rounded-full bg-violet-400/[0.06] blur-3xl" />
        <div className="absolute bottom-[-5rem] left-[-5rem] h-80 w-80 rounded-full bg-emerald-400/[0.06] blur-3xl" />
      </div>

      <StationContextBar
        identity={<SupportTicketIdentity ticket={ticket} fallbackId={ticketId} />}
        moreDetails={
          <StationMoreDetails>
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
            <PaneHeaderCloseButton
              onClick={onClose}
              ariaLabel="Back to tickets queue"
              title="Back to tickets queue"
            />
          </StationMoreDetails>
        }
      />

      <StationWorkbench
        ambientWash={false}
        className="relative z-0 min-h-0 flex-1 bg-transparent"
        reserveScrollClearance={Boolean(terminalVm)}
        tabs={
          <SectionTabsSlider
            tabs={tabs}
            value={activeView}
            onChange={(id) => setView(id as SupportTicketView)}
            ariaLabel="Ticket displays"
          />
        }
        dock={<StationTerminalDock vm={terminalVm} />}
      />
    </motion.div>
  );
}
