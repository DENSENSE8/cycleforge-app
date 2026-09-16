import { MobilePairQty } from '@/components/mobile/pair/MobilePairQty';

/**
 * `/m/pair/[code]/[sku]` — how many of this product are going into this
 * location. The second half of pairing, and the surface a paired row taps
 * into when the count needs more than the ±1 strip.
 */
export default async function MobilePairQtyPage({
  params,
}: {
  params: Promise<{ code: string; sku: string }>;
}) {
  const { code, sku } = await params;
  return <MobilePairQty code={decodeURIComponent(code)} sku={decodeURIComponent(sku)} />;
}
