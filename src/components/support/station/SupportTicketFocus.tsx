'use client';

/**
 * Support · Tickets focus pane — Unbox Station Workbench anatomy for a selected
 * ticket (`?ticket=`). Mirrors `SupportOrdersWorkspace`'s `SupportOrderFocus`
 * (compose, don't fork): StationContextBar identity + StationWorkbench tabs.
 *
 *   StationContextBar → SupportTicketIdentity (#id + subject + status)  ·  Open in Zendesk · Close
 *   StationWorkbench  → Overview | Connections | Ticket | Support | Timeline
 *
 * The tab set is `buildSupportStationTabs` — every tab is an existing SoT surface
 * handed the ticket anchor. Selection is `?ticket=` (Workbench durable URL). L2
 * mode pills stay in the sidebar / master-nav — never in this focus pane.
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
import { useSupportContext } from '@/hooks/useSupportContext';
import type { WorkspaceTimelineAnchor } from '@/components/station/workbench';
import { capabilityTitle } from '@/lib/integrations/capability-labels';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { SupportTicketIdentity } from './SupportTicketIdentity';
import { buildSupportStationTabs } from './support-station-tabs';

type SupportTicketView = 'overview' | 'connections' | 'ticket' | 'support' | 'timeline';

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

  const anchor = useMemo(() => ({ ticket: String(ticketId) }), [ticketId]);
  const { data: contextBundle } = useSupportContext(anchor, true);
  const ticket = contextBundle?.ticket ?? null;

  // Derive the carrier/serial/order anchor for the Timeline tab from linkage.
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
    };
  }, [contextBundle]);

  const tabs = useMemo(
    () => buildSupportStationTabs({ ticketId, anchor, timelineAnchor, onBack: onClose }),
    [ticketId, anchor, timelineAnchor, onClose],
  );

  const activeView: SupportTicketView = tabs.some((t) => t.id === view)
    ? view
    : (tabs[0]?.id as SupportTicketView) ?? 'ticket';

  // Deep-link + label resolve from the bundle's runtime provider (vendor-neutral);
  // fall back to the connector URL + generic capability title while it loads.
  const openUrl = ticket?.openUrl ?? zendeskTicketUrl(ticketId);
  const providerLabel = ticket?.providerLabel ?? capabilityTitle('helpdesk');
  const openLabel = `Open in ${providerLabel}`;

  return (
    <motion.div
      key={ticketId}
      className="relative flex h-full min-h-0 w-full flex-col bg-surface-canvas"
      initial={paneMotion.initial}
      animate={paneMotion.animate}
      exit={paneMotion.exit}
      transition={paneTransition}
    >
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
            <PaneHeaderCloseButton
              onClick={onClose}
              ariaLabel="Back to tickets queue"
              title="Back to tickets queue"
            />
          </StationMoreDetails>
        }
      />

      <StationWorkbench
        className="min-h-0 flex-1"
        reserveScrollClearance={false}
        tabs={
          <SectionTabsSlider
            tabs={tabs}
            value={activeView}
            onChange={(id) => setView(id as SupportTicketView)}
            ariaLabel="Ticket displays"
          />
        }
      />
    </motion.div>
  );
}
