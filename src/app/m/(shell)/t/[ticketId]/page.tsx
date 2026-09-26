'use client';

/** `/m/t/[ticketId]` — the phone's ticket door. */

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
