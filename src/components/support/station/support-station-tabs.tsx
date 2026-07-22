'use client';

/**
 * Support · Tickets — section-tab defs for the Station Workbench focus pane.
 *
 * Mirrors `SupportOrdersWorkspace`'s tab wiring (compose, don't fork): every tab
 * is an existing SoT surface handed the ticket anchor. The view stays dumb.
 *
 *   Overview     → subject/status header + primary anchor summary (linkage strip)
 *   Connections  → SupportContextHub (linkage + Customer|Team|Activity graph)
 *   Ticket       → SupportTicketDetail (the conversation), embedded + dense
 *   Support      → SupportContextHub team segment (internal notes/activity)
 *   Timeline     → WorkspaceTimelineTab when serials/tracking/order resolve
 */

import { Info, Link2, MessageSquare, Clock, Ticket } from '@/components/Icons';
import { SupportContextHub } from '@/components/support/context';
import type { SupportContextAnchor } from '@/hooks/useSupportContext';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import {
  buildSectionTabs,
  resolveTimelineSections,
  WorkspaceTimelineTab,
  type WorkspaceTimelineAnchor,
} from '@/components/station/workbench';

interface SupportStationTabsInput {
  ticketId: number;
  /** SupportContext anchor for this ticket (`{ ticket: String(id) }`). */
  anchor: SupportContextAnchor;
  /** Carrier/serial/order anchor for the Timeline tab (from linkage). */
  timelineAnchor: WorkspaceTimelineAnchor;
  /** Back-to-queue handler threaded into the embedded conversation header. */
  onBack: () => void;
}

export function buildSupportStationTabs({
  ticketId,
  anchor,
  timelineAnchor,
  onBack,
}: SupportStationTabsInput) {
  const timelinePlan = resolveTimelineSections(timelineAnchor);

  return buildSectionTabs([
    {
      id: 'overview',
      label: 'Overview',
      icon: Info,
      content: (
        <div className="space-y-3 pb-4">
          {/* Primary anchor summary — the linkage strip only (no segments). */}
          <SupportContextHub anchor={anchor} variant="station" linkageOnly />
        </div>
      ),
    },
    {
      id: 'connections',
      label: 'Connections',
      icon: Link2,
      content: (
        <div className="space-y-3 pb-4">
          {/* Full linkage graph + Customer|Team|Activity segments. */}
          <SupportContextHub anchor={anchor} variant="station" hideLinkage={false} />
        </div>
      ),
    },
    {
      id: 'ticket',
      label: 'Ticket',
      icon: Ticket,
      content: (
        // Connections owns the linkage strip, so the conversation hides it.
        <div className="flex h-full min-h-0 w-full flex-col">
          <SupportTicketDetail
            ticketId={ticketId}
            onBack={onBack}
            embedded
            hideExternalLink
            hideLinkedContext
          />
        </div>
      ),
    },
    {
      id: 'support',
      label: 'Support',
      icon: MessageSquare,
      content: (
        <div className="space-y-3 pb-4">
          <SupportContextHub
            anchor={anchor}
            variant="station"
            defaultSegment="team"
            hideCustomerSegment
            hideLinkage
          />
        </div>
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: Clock,
      visible: timelinePlan.hasContent,
      content: (
        <div className="space-y-3 pb-4">
          <WorkspaceTimelineTab {...timelineAnchor} />
        </div>
      ),
    },
  ]);
}
