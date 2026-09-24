import { MobilePairQty } from '@/components/mobile/pair/MobilePairQty';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { mobileSkuExceptionScreenHref } from '@/lib/inventory/sku-exception-links';

/**
 * `/m/pair/[code]/[sku]` — how many of this product are going into this
 * location. The second half of pairing, and the surface a paired row taps
 * into when the count needs more than the ±1 strip.
 *
 * `?from=on-hold` — opened from a SKU exception's Locations screen; Back and
 * Confirm return there instead of the pairing list / scan loop.
 */
export default async function MobilePairQtyPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; sku: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ code, sku }, { from }] = await Promise.all([params, searchParams]);
  const decodedSku = decodeURIComponent(sku);
  const returnHref =
    from === 'on-hold' && isProvisionalSku(decodedSku)
      ? mobileSkuExceptionScreenHref(decodedSku, 'locations')
      : undefined;
  return <MobilePairQty code={decodeURIComponent(code)} sku={decodedSku} returnHref={returnHref} />;
}
