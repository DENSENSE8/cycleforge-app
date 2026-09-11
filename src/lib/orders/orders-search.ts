/**
 * Shipping / orders find-bar — one matcher, used by `/api/orders` and tests.
 *
 * SKU-catalog search already escaped LIKE wildcards; this desk did not, so a
 * pasted `ABC_123` matched `ABC-123` and `%` became match-all.
 */
import { escapeLike } from '@/lib/sql-like';
import { normalizeTrackingKey18 } from '@/lib/tracking-format';

export function ordersSearchNeedle(raw: string): string {
  return raw.trim();
}

export function ordersSearchLikePattern(raw: string): string | null {
  const needle = ordersSearchNeedle(raw);
  if (!needle) return null;
  return `%${escapeLike(needle)}%`;
}

export function ordersSearchLast8(raw: string): string {
  const digits = ordersSearchNeedle(raw).replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : '';
}

export function ordersSearchTrackingKey18(raw: string): string {
  return normalizeTrackingKey18(ordersSearchNeedle(raw));
}

/**
 * After a line-level hit list, keep every sibling line of a matching order so
 * the parent fold still has qty / price / boxes. Lines with no order_id stay
 * as themselves.
 */
export function expandHitsToOrderSiblings<T extends { id: number; order_id?: string | null }>(
  all: readonly T[],
  hits: readonly T[],
): T[] {
  const hitIds = new Set(hits.map((row) => row.id));
  const orderIds = new Set(
    hits
      .map((row) => String(row.order_id || '').trim())
      .filter(Boolean),
  );
  if (orderIds.size === 0) return [...hits];
  const out: T[] = [];
  const seen = new Set<number>();
  for (const row of all) {
    const orderId = String(row.order_id || '').trim();
    if (!hitIds.has(row.id) && !(orderId && orderIds.has(orderId))) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
