/** Pure helpers for the Zendesk ticket-watch poller. */

interface TicketWatchCache {
  subject: string | null;
  status: string | null;
}

/** Compare previous registry caches to live Zendesk fields. */
export function diffTicketWatchCaches(
  previous: TicketWatchCache,
  next: TicketWatchCache,
): { changed: boolean; summary: string | null } {
  const prevSubject = previous.subject?.trim() || null;
  const nextSubject = next.subject?.trim() || null;
  const prevStatus = previous.status?.trim() || null;
  const nextStatus = next.status?.trim() || null;

  if (prevSubject === nextSubject && prevStatus === nextStatus) {
    return { changed: false, summary: null };
  }

  const parts: string[] = [];
  if (prevStatus !== nextStatus) {
    parts.push(
      prevStatus
        ? `status ${prevStatus} → ${nextStatus ?? '—'}`
        : `status ${nextStatus ?? '—'}`,
    );
  }
  if (prevSubject !== nextSubject) {
    parts.push(nextSubject ? `subject “${nextSubject}”` : 'subject cleared');
  }
  return { changed: true, summary: parts.join('; ') };
}
