/**
 * Merged activity timeline for the Support Context Hub — dock scans, carrier
 * events, team thread messages, and ticket-link moments. Composes existing
 * `*ToTimeline` adapters; never invents a second timeline renderer.
 */
import {
  carrierEventsToTimeline,
  collapseTimeline,
  opsEventsToTimeline,
  threadMessagesToTimeline,
  type CarrierEvent,
  type OpsEventRow,
  type ThreadMessageTimelineRow,
  type TimelineItem,
  type TimelineTone,
} from '@/lib/timeline';

/** ticket_links (or audit) row describing a ticket attach/detach. */
export interface TicketLinkTimelineRow {
  id: number | string;
  at: string | null;
  /** 'linked' | 'unlinked' */
  kind: 'linked' | 'unlinked';
  ticketLabel: string;
  actorName?: string | null;
}

function ticketLinkEventsToTimeline(rows: TicketLinkTimelineRow[]): TimelineItem[] {
  return rows.map((r) => {
    const tone: TimelineTone = r.kind === 'linked' ? 'success' : 'muted';
    return {
      id: `ticket-link:${r.id}`,
      at: r.at,
      title: r.kind === 'linked' ? 'Ticket linked' : 'Ticket unlinked',
      tone,
      subtitle: r.ticketLabel,
      actor: r.actorName ?? undefined,
      ref: { kind: 'id' as const, value: r.ticketLabel },
      sourceEventType: r.kind === 'linked' ? 'TICKET_LINKED' : 'TICKET_UNLINKED',
    } satisfies TimelineItem;
  });
}

export interface SupportContextTimelineInput {
  opsEvents?: OpsEventRow[];
  carrierEvents?: CarrierEvent[];
  threadMessages?: ThreadMessageTimelineRow[];
  ticketLinks?: TicketLinkTimelineRow[];
}

/**
 * Merge support-context spines → sorted/collapsed {@link TimelineItem}[].
 * Pure / DB-free — callers fetch rows; this only adapts + merge/sort/collapse.
 */
export function mergeSupportContextTimeline(
  input: SupportContextTimelineInput,
): TimelineItem[] {
  const items = [
    ...opsEventsToTimeline(input.opsEvents ?? []),
    ...carrierEventsToTimeline(input.carrierEvents ?? []),
    ...threadMessagesToTimeline(input.threadMessages ?? []),
    ...ticketLinkEventsToTimeline(input.ticketLinks ?? []),
  ].sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta;
  });
  return collapseTimeline(items);
}

export { ticketLinkEventsToTimeline };
