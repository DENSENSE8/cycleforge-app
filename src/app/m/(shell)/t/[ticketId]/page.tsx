'use client';

/**
 * `/m/t/[ticketId]` — the phone's ticket door.
 *
 * A route shell and nothing else: it parses the handle out of the URL and
 * mounts {@link MobileTicketThread}. `t` (not `ticket`) keeps the URL short
 * enough to read aloud on a floor, matching the sibling one-letter detail
 * routes this app already ships — `/m/u/[id]` unit, `/m/r/[id]` receiving,
 * `/m/h/[id]` handling unit, `/m/b/[barcode]`.
 *
 * The id is the PROVIDER ticket number (the `#48120` an operator quotes and
 * `daily_check_item_links` stores), because that is the number every other
 * surface prints. A non-numeric segment is not a 404 — the thread answers it,
 * so a mistyped link lands on a readable screen with a back chevron.
 */

import { useParams } from 'next/navigation';
import { MobileTicketThread } from '@/components/mobile/ticket/MobileTicketThread';

export default function MobileTicketPage() {
  const params = useParams<{ ticketId: string }>();
  const parsed = Number(params?.ticketId);
  const ticketId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  return <MobileTicketThread ticketId={ticketId} />;
}
