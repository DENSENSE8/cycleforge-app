/** The URL contract another phone surface uses to open `/m/t/[ticketId]` with a reply PREPARED, never sent: */

export type TicketThreadVisibility = 'public' | 'internal';

export interface TicketThreadHandoff {
  draft?: string;
  photoIds?: readonly number[];
  visibility?: TicketThreadVisibility;
}

/**
 * Photos one handoff may stage. Well under the reply route's attachment cap
 * (`/api/zendesk/photo-ticket`, `photoIds.max(100)`) — a phone reply is not a
 * bulk export, and the ids ride in a URL.
 */
export const TICKET_HANDOFF_MAX_PHOTOS = 20;

/** `?draft=…&photos=…&visibility=…`, or '' when there is nothing to hand over. */
export function ticketThreadHandoffQuery(handoff: TicketThreadHandoff = {}): string {
  const params = new URLSearchParams();
  if (handoff.draft) params.set('draft', handoff.draft);
  const ids = normalizePhotoIds(handoff.photoIds ?? []);
  if (ids.length) params.set('photos', ids.join(','));
  if (handoff.visibility) params.set('visibility', handoff.visibility);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Read the handoff off the thread's search params. Garbage degrades to
 * "absent" (never an error screen): a bad id is dropped, an unknown
 * visibility leaves the composer on its own default.
 */
export function parseTicketThreadHandoff(
  params: { get(name: string): string | null } | null,
): TicketThreadHandoff & { photoIds: number[] } {
  const draft = params?.get('draft') || undefined;
  const rawPhotos = params?.get('photos') ?? '';
  const photoIds = normalizePhotoIds(rawPhotos.split(',').map((part) => Number(part.trim())));
  const rawVisibility = params?.get('visibility');
  const visibility =
    rawVisibility === 'internal' || rawVisibility === 'public' ? rawVisibility : undefined;
  return { draft, photoIds, visibility };
}

function normalizePhotoIds(ids: readonly number[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id <= 0 || out.includes(id)) continue;
    out.push(id);
    if (out.length === TICKET_HANDOFF_MAX_PHOTOS) break;
  }
  return out;
}
