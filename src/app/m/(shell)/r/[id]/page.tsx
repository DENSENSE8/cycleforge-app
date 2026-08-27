import { cookies } from 'next/headers';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { CartonMobileOpsClient } from '@/components/mobile/receiving/CartonMobileOpsClient';
import { PublicQrLanding } from '@/components/qr/public-qr-landing';

/**
 * `/m/r/[id]` — dual-audience carton Digital Link landing.
 *
 * Staff session → mobile carton ops. Anonymous → the shared branded
 * interstitial ({@link PublicQrLanding}), which resolves the tenant from the
 * slug host and links out to that workspace's own configured website.
 */
export default async function CartonDigitalLinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params; // id is used by the client ops page via useParams
  const sid = readSessionSid(await cookies());
  const user = await getCurrentUserBySid(sid);
  if (user) {
    return <CartonMobileOpsClient />;
  }
  return <PublicQrLanding scanLabel="Receiving carton" />;
}
