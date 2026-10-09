/** Browser calls for the Live feed's card verbs: flag / clear, remove an unlinked card / put back, pair. Client-safe. */

import type { UnlinkedDismissReason } from '@/lib/live-feed/dismissals';
import type { LiveFeedFlagReasonId } from '@/lib/live-feed/flags';
import { LIVE_FEED_DISMISSALS_API, LIVE_FEED_FLAGS_API, LIVE_FEED_PAIR_API } from '@/lib/live-feed/route';

async function send(href: string, method: 'POST' | 'DELETE', body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(href, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? `Request failed (${res.status})`));
  return json;
}

/** Card ids that took the flag now (a card already holding the reason is left as it was). */
export async function flagCards(cardIds: readonly number[], reason: LiveFeedFlagReasonId, note: string | null): Promise<number[]> {
  return ((await send(LIVE_FEED_FLAGS_API, 'POST', { cardIds, reason, note })).changedIds as number[]) ?? [];
}

/** Clear one reason, or every active flag when `reason` is null. */
export async function clearCardFlags(cardIds: readonly number[], reason: string | null): Promise<number[]> {
  return ((await send(LIVE_FEED_FLAGS_API, 'DELETE', { cardIds, reason })).changedIds as number[]) ?? [];
}

export async function dismissUnlinked(cardIds: readonly number[], reason: UnlinkedDismissReason, note: string | null): Promise<number[]> {
  return ((await send(LIVE_FEED_DISMISSALS_API, 'POST', { cardIds, reason, note })).changedIds as number[]) ?? [];
}

export async function restoreUnlinked(cardIds: readonly number[]): Promise<number[]> {
  return ((await send(LIVE_FEED_DISMISSALS_API, 'DELETE', { cardIds })).changedIds as number[]) ?? [];
}

/** Pair an unlinked card to an order; resolves to the order row the card became. */
export async function pairCardToOrder(cardId: number, orderRowId: number): Promise<{ orderRowId: number; tracking: string }> {
  const json = await send(LIVE_FEED_PAIR_API, 'POST', { cardId, orderRowId });
  return { orderRowId: Number(json.orderRowId), tracking: String(json.tracking ?? '') };
}
