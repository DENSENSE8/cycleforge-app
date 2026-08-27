import type {
  CartonInspectorLine,
  CartonInspectorReceiving,
} from '@/components/receiving/inspector/carton-inspector-model';
import {
  resolveSearchOrder,
  type ResolvedSearchOrder,
} from '@/lib/search/resolve-search-order';
import { receivingOrderLinkTokens } from '@/lib/search/receiving-order-link-tokens';

/**
 * Resolve a marketplace order linked to a carton — local pickup id, tracking,
 * or line tracking through {@link resolveSearchOrder}. Miss = unmatched chrome.
 */
export async function resolveReceivingLinkedOrder(
  receiving: CartonInspectorReceiving,
  lines?: ReadonlyArray<CartonInspectorLine> | null,
): Promise<ResolvedSearchOrder | null> {
  for (const token of receivingOrderLinkTokens(receiving, lines)) {
    const result = await resolveSearchOrder(token);
    if (result.status === 'ok') return result;
  }
  return null;
}
