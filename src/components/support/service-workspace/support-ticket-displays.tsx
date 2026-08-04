'use client';

/**
 * Support · Tickets — the ticket's DISPLAYS, and they live on the right edge.
 *
 *   centre → the customer conversation + the composer that commits it
 *   right  → Connections · Conversations · Timeline · Assist, one at a time
 *
 * ## Why the strip moved off the middle (2026-08-02)
 *
 * The thread used to mount a `SectionTabsSlider` in its own body, so reaching
 * the linkage, the team thread or the history meant **swapping the conversation
 * out** — on the one surface whose entire job is reading and answering that
 * conversation. That is the branch's own ranking rule read backwards
 * (`workbench-service.md` → *the middle is the work; the right side is the
 * extras*), and Unbox had already answered it: its workbench body is the
 * procedure and every other display lives in the right-edge Displays column
 * (`display/station-workbench.md`). Support now wears the same shape, down to
 * the switcher's `density="icon"` — a flat icon row where only the selected
 * display names itself, because a switcher inside a ~420px column must not
 * out-shout the display it switches.
 *
 * ## Conversations is here, and that is a deliberate correction
 *
 * `workbench-service.md` placed the internal team thread in the middle, on the
 * grounds that "a second composer in the rail would be two writers over one
 * thread". The premise does not hold: the team thread and the customer ticket
 * are two DIFFERENT threads with two different audiences, so their composers
 * write to different stores — the thing the rule guards against never occurs.
 * What the old placement did cost was real: the customer conversation had to
 * leave the screen to write an internal note about it.
 *
 * Each display owns its own controls. Conversations keeps its inline composer
 * rather than reaching for the bottom dock, because the dock is **ticket-terminal**
 * — a click on the right edge re-labelling the button at the bottom is the
 * cross-region action-at-a-distance the station law bans.
 *
 * ## Updates is absent on purpose
 *
 * The old rail's "Updates" tab rendered `SupportContextHub onlySegment="activity"`,
 * which is `bundle.timeline` — the exact array Timeline's Activity spine already
 * shows. Two homes for one fact; Timeline is the superset (Units · Tracking ·
 * Activity), so it keeps the job.
 */

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

/**
 * The rail's displays for one ticket.
 *
 * A hook, not a builder, because the Timeline display needs the SupportContext
 * bundle and the rail is mounted from `SupportTicketsWorkspace` — which cannot
 * call it conditionally. `anchor: null` (no open ticket) yields an empty list
 * and the underlying query stays disabled, so the hook is free at rest.
 */
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
  // *Who owns this* is context for the conversation, not the conversation — the
  // branch's ranking rule — and it was costing a permanent dropdown row on the
  // reading surface. Same cached bundle the thread reads, so no second fetch.
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
          <div className="stack-row">
            {liveTicket ? (
              <section className="stack-tight">
                <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                  Assigned
                </p>
                <TicketAssignmentFields ticket={liveTicket} />
              </section>
            ) : null}
            <SupportContextHub
              anchor={anchor}
              linkageOnly
              hideTicketEmbed
              surface="flush"
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
