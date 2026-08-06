/**
 * Pure helpers: in-flight Ably count → PhotoPeek placeholder cards.
 * Kept data-free so unit tests don't need the React peek or Ably.
 */

import type { PhotoMeta } from '@/components/shipped/photo-gallery/photo-gallery-utils';

export type PeekCard = {
  id: string;
  imgUrl: string;
  alt: string;
  meta?: PhotoMeta;
  /** Ably in-flight placeholder — skeleton tile; not openable in the viewer. */
  pending?: boolean;
};

/** Build newest-first pending skeleton cards for an absolute in-flight count. */
function buildPendingPeekCards(receivingId: number, inFlight: number): PeekCard[] {
  const n = Math.max(0, Math.floor(Number(inFlight) || 0));
  if (n === 0 || !Number.isFinite(receivingId)) return [];
  const cards: PeekCard[] = [];
  for (let i = 0; i < n; i++) {
    cards.push({
      id: `pending:${receivingId}:${i}`,
      imgUrl: '',
      alt: 'Uploading photo',
      pending: true,
    });
  }
  return cards;
}

/** Newest-first merge: placeholders first (live shutters), then committed photos. */
export function mergePeekCards(real: PeekCard[], inFlight: number, receivingId: number): PeekCard[] {
  const pending = buildPendingPeekCards(receivingId, inFlight);
  if (pending.length === 0) return real;
  return [...pending, ...real];
}
