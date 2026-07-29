import { redirect } from 'next/navigation';

/**
 * Bare `/shipping` → the Labels mode's own route.
 *
 * The four modes are segments now, so there is exactly one canonical URL per
 * view; leaving Labels reachable at both `/shipping` and `/shipping/labels`
 * would re-create the ambiguity the migration removes. Nav points straight at
 * `/shipping/labels`, so this hop only ever serves an old bookmark.
 *
 * Legacy `?mode=` links redirect in `next.config.ts` (307 while they drain —
 * 308 is cached permanently by browsers and must wait for the sunset).
 */
export default function ShippingIndexPage() {
  redirect('/shipping/labels');
}
