'use client';

/** Support · Tickets — the ticket's DISPLAYS, and they live on the right edge. */

import { useMemo } from 'react';
import { Clock, Link2, MessageSquare, Sparkles } from '@/components/Icons';
import type { SectionTab } from '@/design-system/components';
import { SupportContextHub } from '@/components/support/context';
import { TicketAssignmentFields } from '@/components/support/zendesk/chat/SupportTicketFields';
import {
  WorkspaceTimelineTab,
  type WorkspaceTimelineAnchor,
} from '@/components/station/workbench';
import { useSupportContext, type SupportContextAnchor } from '@/hooks/useSupportContext';
import type { StagedPhoto } from '@/hooks/useTicketPhotoStaging';
import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { SupportAssistDisplay } from './SupportAssistDisplay';

/** The rail's displays for one ticket. */
export function useSupportTicketDisplays(
  anchor: SupportContextAnchor | null,
  /**
   * The thread's composer bridge. Assist drafts INTO it and never sends; it is
   * `null` while the composer is unmounted, which only disables the Use control.
   */
  ticketBridge: ThreadComposerBridge | null = null,
  /**
   * The vision loop's inputs, owned by the workspace because the paste lands on
   * the thread and the draft is prepared in the rail — one bag of staged photos,
   * two readers.
   */
  vision: {
    stagedPhotos: StagedPhoto[];
    stagingUploading: boolean;
    /** Bumped on paste; Assist runs once per bump, after the upload resolves. */
    autoRunId: number;
  } = { stagedPhotos: [], stagingUploading: false, autoRunId: 0 },
): SectionTab[] {
  // Same query key as the thread's own `useSupportContext` — one fetch, two
  // readers. Never a second derivation of where this ticket is linked.
  const enabledAnchor = anchor ?? {};
  const { data: bundle } = useSupportContext(enabledAnchor, anchor != null);

  // Assignment demoted here from the chat header's field band (2026-08-02).
  const anchorTicketId = Number(anchor?.ticket ?? NaN);
  const providerTicketId =
    bundle?.ticket?.providerTicketId ?? (Number.isFinite(anchorTicketId) ? anchorTicketId : null);
  const { data: liveBundle } = useZendeskTicketBundle(providerTicketId ?? 0);
  const liveTicket = liveBundle?.ticket ?? null;

  const timelineAnchor = useMemo<WorkspaceTimelineAnchor>(() => {
    const linkage = bundle?.linkage;
    const primaryTracking =
      linkage?.trackings.find((t) => t.isPrimary)?.tracking ??
      linkage?.trackings[0]?.tracking ??
      null;
    return {
      orderId: linkage?.order?.orderId ?? null,
      tracking: primaryTracking,
      serials: (linkage?.serials ?? []).map((s) => s.serial).filter(Boolean),
      receivingId: bundle?.linkable?.receivingId ?? null,
      activity: { items: bundle?.timeline ?? [], loading: !bundle },
    };
  }, [bundle]);

  return useMemo<SectionTab[]>(() => {
    if (!anchor) return [];
    return [
      {
        id: 'connections',
        label: 'Connections',
        icon: Link2,
        content: (
          <div className="flex flex-col gap-0">
            {liveTicket ? (
              <section className="border-b border-border-hairline px-3 py-2.5">
                <p className="text-role-eyebrow text-text-soft">
                  Assigned
                </p>
                <div className="mt-1.5">
                  <TicketAssignmentFields ticket={liveTicket} />
                </div>
              </section>
            ) : null}
            <SupportContextHub
              anchor={anchor}
              linkageOnly
              hideTicketEmbed
              surface="flush"
              className="min-w-0"
            />
          </div>
        ),
      },
      {
        id: 'conversations',
        label: 'Conversations',
        icon: MessageSquare,
        content: (
          <SupportContextHub
            anchor={anchor}
            defaultSegment="team"
            onlySegment="team"
            hideCustomerSegment
            hideLinkage
            hideTicketEmbed
            surface="flush"
          />
        ),
      },
      {
        id: 'timeline',
        label: 'Timeline',
        icon: Clock,
        // Always on — the Activity spine keeps this useful before tracking or
        // serials resolve.
        content: <WorkspaceTimelineTab {...timelineAnchor} />,
      },
      // Suggesting is an extra; sending is the work — so drafting is a display
      // on the right edge, never a panel in the middle. It bridges into the
      // composer and has no path to submit.
      {
        id: 'assist',
        label: 'Assist',
        icon: Sparkles,
        content:
          providerTicketId != null ? (
            <SupportAssistDisplay
              ticketId={providerTicketId}
              bridge={ticketBridge}
              stagedPhotos={vision.stagedPhotos}
              stagingUploading={vision.stagingUploading}
              autoRunId={vision.autoRunId}
            />
          ) : null,
      },
    ];
  }, [anchor, timelineAnchor, liveTicket, providerTicketId, ticketBridge, vision]);
}
