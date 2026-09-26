import { MobilePairQty } from '@/components/mobile/pair/MobilePairQty';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';

/**
 * `/m/pair/[code]/[sku]` — how many of this product are going into this
 * location. The second half of pairing, and the surface a paired row taps
 * into when the count needs more than the ±1 strip.
 *
 * `?return=/m/loc/…` — opened from the location record; Back and Confirm
 * return to it. `?mode=take` opens on − TAKE.
 */
export default async function MobilePairQtyPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; sku: string }>;
  searchParams: Promise<{ return?: string | string[]; mode?: string | string[] }>;
}) {
  const [{ code, sku }, query] = await Promise.all([params, searchParams]);
  const returnParam = typeof query.return === 'string' ? mobileJobReturn(query.return) : null;
  return (
    <MobilePairQty
      code={decodeURIComponent(code)}
      sku={decodeURIComponent(sku)}
      returnHref={returnParam ?? undefined}
      initialMode={query.mode === 'take' ? 'minus' : 'plus'}
    />
  );
}
