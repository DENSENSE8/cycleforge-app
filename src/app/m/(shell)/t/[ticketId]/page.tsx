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
 *
 * `?draft=` seeds the reply box, `?photos=` stages existing photos as
 * attachments and `?visibility=internal|public` picks the channel
 * (`lib/composer/ticket-thread-handoff`). All editable, never auto-sent — the
 * repair workbench hands its customer updates and photos over this way.
 */

import { Suspense, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MobileTicketThread } from '@/components/mobile/ticket/MobileTicketThread';
import { parseTicketThreadHandoff } from '@/lib/composer/ticket-thread-handoff';

function MobileTicketPageInner() {
  const params = useParams<{ ticketId: string }>();
  const searchParams = useSearchParams();
  const parsed = Number(params?.ticketId);
  const ticketId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const handoff = useMemo(() => parseTicketThreadHandoff(searchParams), [searchParams]);

  return <MobileTicketThread ticketId={ticketId} handoff={handoff} />;
}

export default function MobileTicketPage() {
  return (
    <Suspense fallback={null}>
      <MobileTicketPageInner />
    </Suspense>
  );
}
