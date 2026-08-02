'use client';

/**
 * Support · Tickets — the ticket's DISPLAYS, and they live on the right edge.
 *
 *   centre → the customer conversation + the composer that commits it
 *   right  → Connections · Conversations · Timeline, one at a time
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
import { Clock, Link2, MessageSquare } from '@/components/Icons';
import type { SectionTab } from '@/design-system/components';
import { SupportContextHub } from '@/components/support/context';
import {
  WorkspaceTimelineTab,
  type WorkspaceTimelineAnchor,
} from '@/components/station/workbench';
import { useSupportContext, type SupportContextAnchor } from '@/hooks/useSupportContext';

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
): SectionTab[] {
  // Same query key as the thread's own `useSupportContext` — one fetch, two
  // readers. Never a second derivation of where this ticket is linked.
  const enabledAnchor = anchor ?? {};
  const { data: bundle } = useSupportContext(enabledAnchor, anchor != null);

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
          <SupportContextHub
            anchor={anchor}
            linkageOnly
            hideTicketEmbed
            surface="flush"
          />
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
    ];
  }, [anchor, timelineAnchor]);
}
