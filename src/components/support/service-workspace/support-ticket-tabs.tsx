'use client';

/**
 * Support · Tickets — section-tab defs for the thread focus pane.
 *
 *   Ticket         → SupportTicketDetail (customer conversation)
 *   Conversations  → internal team thread (née Support)
 *   Timeline       → {@link WorkspaceTimelineTab} + Activity spine
 *
 * **Connections is no longer a tab** (2026-08-01). Linkage — tracking / order /
 * serial — is *context beside the conversation*, not a view the operator swaps
 * the conversation out to reach. It moved to the `service-workspace` right push
 * column via {@link buildSupportContextColumn}; the branch law
 * (`.claude/rules/display/workbench-service.md`) names that column as the third
 * slot. `resolveSupportTerminal` still understands a `connections` tab id and is
 * left alone — the resolver is not the tab registry.
 *
 * Every panel shares glass {@link WorkspaceCard} elevation except Timeline,
 * which owns its own glass shell inside WorkspaceTimelineTab.
 */

import type { ReactNode } from 'react';
import { MessageSquare, Clock, Ticket } from '@/components/Icons';
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
  /**
   * When true, Ticket tab skips the sticky composer — host mounts
   * {@link SupportTicketComposerDock} and provides staging via context.
   */
  hostComposer?: boolean;
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

/**
 * The `service-workspace` RIGHT push column — ticket linkage beside the thread.
 *
 * Same `SupportContextHub` the Connections tab mounted, with the same props;
 * only its seat changed. Kept here (not in the shell) so the shell stays
 * domain-free and one file owns what a ticket's panes contain.
 */
export function buildSupportContextColumn({ anchor }: { anchor: SupportContextAnchor }) {
  return (
    <div className="flex min-h-0 flex-col gap-2 p-2">
      <p className="px-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
        Connections
      </p>
      {/* Linkage chips only — no Customer/Team/Activity segment chrome. */}
      <SupportContextHub
        anchor={anchor}
        variant="workbench"
        linkageOnly
        hideTicketEmbed
        surface="flush"
      />
    </div>
  );
}

export function buildSupportTicketTabs({
  ticketId,
  anchor,
  timelineAnchor,
  onBack,
  onComposerBridgeChange,
  onConversationBridgeChange,
  hostComposer = false,
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
            onComposerBridgeChange={hostComposer ? undefined : onComposerBridgeChange}
            composerPlacement={hostComposer ? 'host' : 'inline'}
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
