import { MobilePairQty } from '@/components/mobile/pair/MobilePairQty';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';

/** `/m/pair/[code]/[sku]` — how many of this product are going into this location. */
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
