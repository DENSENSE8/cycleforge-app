'use client';

/**
 * The support-ticket number the repair paperwork previews on the review step.
 *
 * Fetched ONCE per mount, deliberately not polled and not revalidated: it is a
 * projection whose whole job is to give the customer a number to look at while
 * they sign (`src/lib/support/next-ticket-preview.ts`), and a number that
 * changed under a signature would be worse than one that is merely stale.
 *
 * `null` is the normal, silent outcome — no helpdesk connected, an offline
 * tablet, a provider hiccup. The paperwork then renders exactly the sheet it
 * rendered before this existed, because `formatRepairPaperTicketNumber('')`
 * already collapses to no heading.
 *
 * Callers: `KioskRepairPane` (review step), `KioskPaperworkPanel`.
 * Affected API: GET `/api/kiosk/repair/next-ticket`. Schemas: none.
 */

import { useEffect, useState } from 'react';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import type { KioskTicketChoice } from '@/lib/kiosk/repair-ticket-choice';

export function useNextTicketPreview(enabled: boolean): number | null {
  const [nextTicketId, setNextTicketId] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || nextTicketId !== null) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await kioskFetchHealed('/api/kiosk/repair/next-ticket', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { nextTicketId?: unknown };
        if (cancelled) return;
        if (typeof data.nextTicketId === 'number') setNextTicketId(data.nextTicketId);
      } catch {
        // Silent by design: a missing preview is a sheet without a number, and
        // the counter has nothing to tell the customer about it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, nextTicketId]);

  return nextTicketId;
}

/**
 * The number the paperwork states: a LINKED ticket outranks the projection,
 * because it is a fact — `ATTACH_TICKET` stamps `repair_service.ticket_number`
 * with the picked ticket, so the printed sheet will carry exactly that number.
 */
export function paperworkTicketNumber(
  ticketChoice: KioskTicketChoice | null,
  nextTicketId: number | null,
): number | null {
  if (ticketChoice?.mode === 'attach' && ticketChoice.ticketId > 0) return ticketChoice.ticketId;
  return nextTicketId;
}
