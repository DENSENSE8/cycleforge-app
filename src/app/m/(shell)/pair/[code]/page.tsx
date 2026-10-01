import { MobilePairLocation } from '@/components/mobile/pair/MobilePairLocation';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';

/** `/m/pair/[code]` — pick what belongs in a scanned location. */
export default async function MobilePairPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ exception?: string; verified?: string; return?: string }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  return (
    <MobilePairLocation
      code={decodeURIComponent(code)}
      openException={query.exception === '1'}
      verificationToken={query.verified?.trim() || null}
      returnHref={mobileJobReturn(query.return)}
    />
  );
}
