import { MobilePairLocation } from '@/components/mobile/pair/MobilePairLocation';

/**
 * `/m/pair/[code]` — pick what belongs in a scanned location.
 *
 * Reached by tapping through from `/m/scan` when a location comes back empty,
 * and deep-linkable so a desk can hand the job to a phone.
 */
export default async function MobilePairPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <MobilePairLocation code={decodeURIComponent(code)} />;
}
