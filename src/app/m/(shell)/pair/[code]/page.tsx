import { MobilePairLocation } from '@/components/mobile/pair/MobilePairLocation';

/**
 * `/m/pair/[code]` — pick what belongs in a scanned location.
 *
 * Reached by tapping through from `/m/scan` when a location comes back empty,
 * and deep-linkable so a desk can hand the job to a phone. `?exception=1`
 * lands with the SKU-exception sheet open (the location hub's "Not in the
 * catalog" door).
 */
export default async function MobilePairPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ exception?: string }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  return <MobilePairLocation code={decodeURIComponent(code)} openException={query.exception === '1'} />;
}
