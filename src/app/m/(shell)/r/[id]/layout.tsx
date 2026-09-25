import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { CartonRealtime } from '@/components/mobile/receiving/CartonRealtime';
import { PublicQrLanding } from '@/components/qr/public-qr-landing';

/**
 * `/m/r/[id]/*` — the carton's Digital Link is dual-audience, so the gate sits
 * on every carton screen, not only the hub.
 *
 * Staff session → the carton's exoskeleton screens under one receiving
 * realtime subscription. Anonymous → the shared branded interstitial
 * ({@link PublicQrLanding}), which resolves the tenant from the slug host and
 * links out to that workspace's own configured website.
 */
export default async function CartonLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserBySid(readSessionSid(await cookies()));
  if (!user) return <PublicQrLanding scanLabel="Receiving carton" />;
  return <CartonRealtime>{children}</CartonRealtime>;
}
