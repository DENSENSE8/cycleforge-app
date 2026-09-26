import { MobilePairLocation } from '@/components/mobile/pair/MobilePairLocation';

/** `/m/pair/[code]` — pick what belongs in a scanned location. */
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
