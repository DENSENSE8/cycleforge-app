/**
 * ONE status per pasted number (operator 2026-10-04). A number can sit in
 * several buckets — not received AND an exception, awaiting tracking AND not
 * received — and filters keep that membership (it counts under each chip),
 * but every surface PAINTS one identifier: the most specific, by the
 * precedence declared here once per locator, over that locator's own ids.
 *
 * - inbound: exceptions › awaiting tracking › not received › received;
 * - outbound: exceptions, then the desk's own view order;
 * - support: the local statuses in chip order (live work before resolved).
 *
 * Across sections the page's own section leads (the list on screen), then
 * the precedence, then the answer's order.
 */

import type { NavLocateScope, NavLocator } from '@/lib/nav/context/schema';
import { INBOUND_BUCKET_IDS } from '@/lib/nav/locate/inbound';
import { OUTBOUND_LOCATE_STATUSES } from '@/lib/nav/locate/outbound-params';
import { SUPPORT_LOCATE_STATUSES } from '@/lib/nav/locate/support-params';

type InboundBucketId = (typeof INBOUND_BUCKET_IDS)[number];

const INBOUND_PRECEDENCE = [
  'exceptions',
  'awaiting_tracking',
  'not_received',
  'received',
] as const satisfies readonly InboundBucketId[];

/** Most specific first, per locator — every id the locator answers with appears once. */
export const LOCATE_BUCKET_PRECEDENCE: Readonly<Record<NavLocator, readonly string[]>> = {
  inbound: INBOUND_PRECEDENCE,
  outbound: ['exceptions', ...OUTBOUND_LOCATE_STATUSES.filter((id) => id !== 'exceptions')],
  support: SUPPORT_LOCATE_STATUSES,
};

/** `inbound:received` → inbound / received; a bare id belongs to the scope's own locator. */
function sectionOf(id: string, scope: NavLocateScope): { locator: NavLocator | null; own: string; elsewhere: boolean } {
  const at = id.indexOf(':');
  if (at > 0) return { locator: id.slice(0, at) as NavLocator, own: id.slice(at + 1), elsewhere: true };
  return { locator: scope === 'everywhere' ? null : scope, own: id, elsewhere: false };
}

/** The ONE bucket id a number is painted with, or null when it is found nowhere. */
export function primaryBucketId(bucketIds: readonly string[], scope: NavLocateScope): string | null {
  let best: { id: string; elsewhere: boolean; rank: number } | null = null;
  for (const id of bucketIds) {
    const { locator, own, elsewhere } = sectionOf(id, scope);
    const order = locator ? LOCATE_BUCKET_PRECEDENCE[locator] : undefined;
    const at = order ? order.indexOf(own) : -1;
    const rank = at < 0 ? Number.MAX_SAFE_INTEGER : at;
    if (!best || (best.elsewhere && !elsewhere) || (best.elsewhere === elsewhere && rank < best.rank)) {
      best = { id, elsewhere, rank };
    }
  }
  return best?.id ?? null;
}
