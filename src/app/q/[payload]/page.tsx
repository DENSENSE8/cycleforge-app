import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

/** /q/[payload] — generic short-URL landing. */
export default async function GenericScanLandingPage({
  params,
}: {
  params: Promise<{ payload: string }>;
}) {
  const { payload } = await params;
  const cleaned = decodeURIComponent(payload || '').trim();
  if (!cleaned) redirect('/');

  // Prefer a mobile-scanner deep link when the user-agent looks mobile.
  const ua = (await headers()).get('user-agent') ?? '';
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const target = isMobile
    ? `/m/signin?scan=${encodeURIComponent(cleaned)}`
    : `/dashboard?scan=${encodeURIComponent(cleaned)}`;
  redirect(target);
}
