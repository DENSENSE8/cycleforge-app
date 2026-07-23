'use client';

/**
 * Support · Tickets — section-tab defs for the Station Workbench focus pane.
 *
 *   Ticket         → SupportTicketDetail (customer conversation)
 *   Connections    → linkage only (tracking / order / serial / link actions)
 *   Conversations  → internal team thread (née Support)
 *   Timeline       → {@link WorkspaceTimelineTab} (Unbox method) + Activity spine
 *
 * Every panel shares glass {@link WorkspaceCard} elevation except Timeline,
 * which owns its own Unbox glass shell inside WorkspaceTimelineTab.
 */

import type { ReactNode } from 'react';
import { Link2, MessageSquare, Clock, Ticket } from '@/components/Icons';
import { WorkspaceCard } from '@/design-system/components';
import { SupportContextHub } from '@/components/support/context';
import type { SupportContextAnchor } from '@/hooks/useSupportContext';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import {
  buildSectionTabs,
  WorkspaceTimelineTab,
  type WorkspaceTimelineAnchor,
} from '@/components/station/workbench';

interface SupportStationTabsInput {
  ticketId: number;
  /** SupportContext anchor for this ticket (`{ ticket: String(id) }`). */
  anchor: SupportContextAnchor;
  /** Carrier/serial/order + optional Activity spine for the Timeline tab. */
  timelineAnchor: WorkspaceTimelineAnchor;
  /** Back-to-queue handler threaded into the embedded conversation header. */
  onBack: () => void;
  /** Exposes the Ticket-tab composer to the station floating send dock. */
  onComposerBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  /** Exposes the Conversations warehouse-thread composer to the floating dock. */
  onConversationBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
}

function TabPanelShell({
  children,
  /**
   * Ticket / Conversations need a flex column that can scroll internally.
   * Cap height — never force a min-height that invents empty bottom padding.
   */
  scrollPane = false,
}: {
  children: ReactNode;
  scrollPane?: boolean;
}) {
  return (
    <WorkspaceCard
      variant="glass"
      overflow="hidden"
      className={
        scrollPane
          ? 'flex max-h-[min(72vh,52rem)] min-h-0 flex-col'
          : 'min-h-0'
      }
      bodyClassName={
        scrollPane
          ? 'flex min-h-0 flex-1 flex-col p-0'
          : 'p-3 sm:p-4'
      }
    >
      {children}
    </WorkspaceCard>
  );
}

export function buildSupportStationTabs({
  ticketId,
  anchor,
  timelineAnchor,
  onBack,
  onComposerBridgeChange,
  onConversationBridgeChange,
}: SupportStationTabsInput) {
  return buildSectionTabs([
    {
      id: 'ticket',
      label: 'Ticket',
      icon: Ticket,
      content: (
        <TabPanelShell scrollPane>
          <SupportTicketDetail
            ticketId={ticketId}
            onBack={onBack}
            embedded
            hideExternalLink
            hideLinkedContext
            onComposerBridgeChange={onComposerBridgeChange}
          />
        </TabPanelShell>
      ),
    },
    {
      id: 'connections',
      label: 'Connections',
      icon: Link2,
      content: (
        <TabPanelShell>
          {/* Linkage chips only — no Customer/Team/Activity segment chrome. */}
          <SupportContextHub
            anchor={anchor}
            variant="station"
            linkageOnly
            hideTicketEmbed
            surface="flush"
          />
        </TabPanelShell>
      ),
    },
    {
      id: 'conversations',
      label: 'Conversations',
      icon: MessageSquare,
      content: (
        <TabPanelShell scrollPane>
          <SupportContextHub
            anchor={anchor}
            variant="station"
            defaultSegment="team"
            onlySegment="team"
            hideCustomerSegment
            hideLinkage
            hideTicketEmbed
            surface="flush"
            externalSubmit
            onBridgeChange={onConversationBridgeChange}
            className="min-h-0"
          />
        </TabPanelShell>
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: Clock,
      // Always on — Activity spine keeps the Unbox Timeline method useful
      // even before tracking/serials resolve.
      content: <WorkspaceTimelineTab {...timelineAnchor} />,
    },
  ]);
}
