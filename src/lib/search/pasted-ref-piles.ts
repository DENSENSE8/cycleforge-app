/**
 * `/search?refs=` piles. Names are locate bucket labels — the desk does not
 * invent a second word. One row, one pile; the rows that need a person lead.
 */
import type { NavLocateBucket, NavLocateEntry } from '@/lib/nav/context/schema';

export const PASTED_REF_PILE_ORDER = ['awaiting_tracking', 'exceptions', 'triage', 'quiet'] as const;
export type PastedRefPile = (typeof PASTED_REF_PILE_ORDER)[number];

/** Facets the Exceptions list's neighbours already use for "here, not clean". */
const DIRTY_FACETS = new Set(['delivered_not_scanned', 'erp_ahead', 'warehouse_owed']);

const RANK: Record<PastedRefPile | 'rest', number> = {
  awaiting_tracking: 0,
  exceptions: 1,
  triage: 2,
  rest: 3,
  quiet: 4,
};

function has(entry: NavLocateEntry, id: string): boolean {
  return entry.buckets.includes(id);
}

export function pastedRefPile(entry: NavLocateEntry): PastedRefPile | 'rest' {
  if (has(entry, 'inbound:awaiting_tracking') || has(entry, 'awaiting_tracking')) return 'awaiting_tracking';
  const facet = entry.facet?.id;
  if (has(entry, 'inbound:exceptions') || has(entry, 'exceptions') || (facet != null && DIRTY_FACETS.has(facet))) {
    return 'exceptions';
  }
  const shipped = has(entry, 'outbound:shipped') || has(entry, 'shipped');
  if (!shipped && (has(entry, 'outbound:triage') || has(entry, 'triage') || has(entry, 'outbound:exceptions'))) {
    return 'triage';
  }
  const received = has(entry, 'inbound:received') || has(entry, 'received');
  if ((received || shipped) && !has(entry, 'outbound:exceptions')) return 'quiet';
  return 'rest';
}

function bucketLabel(buckets: readonly NavLocateBucket[], id: string): string | null {
  return buckets.find((bucket) => bucket.id === id)?.label ?? null;
}

/** The chip's words — a locate bucket label, never a pile nickname. */
export function pastedRefPileLabel(
  pile: PastedRefPile,
  buckets: readonly NavLocateBucket[],
  entries: readonly NavLocateEntry[],
): string {
  if (pile === 'quiet') {
    const quiet = entries.filter((entry) => pastedRefPile(entry) === 'quiet');
    const shipped = quiet.filter((entry) => has(entry, 'outbound:shipped') || has(entry, 'shipped')).length;
    const id = shipped > quiet.length - shipped ? 'outbound:shipped' : 'inbound:received';
    return bucketLabel(buckets, id) ?? bucketLabel(buckets, id.slice(id.indexOf(':') + 1)) ?? id;
  }
  const id =
    pile === 'awaiting_tracking'
      ? 'inbound:awaiting_tracking'
      : pile === 'exceptions'
        ? 'inbound:exceptions'
        : 'outbound:triage';
  const suffix = id.slice(id.indexOf(':') + 1);
  return bucketLabel(buckets, id) ?? bucketLabel(buckets, suffix) ?? suffix;
}

/** Lead bucket suffix for the status column — the pile's own label, not the first hit. */
export function leadBucketSuffix(entry: NavLocateEntry): string | null {
  switch (pastedRefPile(entry)) {
    case 'awaiting_tracking':
      return 'awaiting_tracking';
    case 'exceptions':
      return entry.buckets.some((id) => id === 'exceptions' || id.endsWith(':exceptions')) ? 'exceptions' : null;
    case 'triage':
      return entry.buckets.some((id) => id === 'triage' || id.endsWith(':triage')) ? 'triage' : 'exceptions';
    case 'quiet':
      return entry.buckets.some((id) => id === 'shipped' || id.endsWith(':shipped')) &&
        !entry.buckets.some((id) => id === 'received' || id.endsWith(':received'))
        ? 'shipped'
        : 'received';
    default:
      return null;
  }
}

export function comparePastedRefs(a: NavLocateEntry, b: NavLocateEntry, order: ReadonlyMap<string, number>): number {
  const rank = RANK[pastedRefPile(a)] - RANK[pastedRefPile(b)];
  if (rank !== 0) return rank;
  return (order.get(a.ref) ?? 0) - (order.get(b.ref) ?? 0);
}
