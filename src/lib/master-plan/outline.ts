/**
 * Master-plan outline — group `<TicketStatus />` tags under the nearest
 * preceding `##` heading. Pure; safe for client + server (no DB).
 *
 * Used by Plans Live TOC and by the ops-plans projection bridge.
 */

import { scanTicketStatuses, type ScannedTicket } from './ticket-status';

const FALLBACK_SECTION = 'Plan';

interface OutlineSection {
  heading: string;
  tickets: ScannedTicket[];
}

/** Group tickets under the nearest preceding `##` heading (pure). */
export function buildMasterPlanOutline(mdx: string): OutlineSection[] {
  const headings: Array<{ title: string; start: number }> = [];
  for (const m of mdx.matchAll(/^##\s+(.+)$/gm)) {
    headings.push({ title: m[1]!.trim(), start: m.index! });
  }
  const sections = new Map<string, OutlineSection>();
  for (const ticket of scanTicketStatuses(mdx)) {
    let heading = FALLBACK_SECTION;
    for (const h of headings) {
      if (h.start < ticket.start) heading = h.title;
      else break;
    }
    if (!sections.has(heading)) sections.set(heading, { heading, tickets: [] });
    sections.get(heading)!.tickets.push(ticket);
  }
  return [...sections.values()];
}
