import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { CartonRealtime } from '@/components/mobile/receiving/CartonRealtime';
import { PublicQrLanding } from '@/components/qr/public-qr-landing';

/** `/m/r/[id]/*` — the carton's Digital Link is dual-audience, so the gate sits on every carton screen, not only the hub. */
export default async function CartonLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserBySid(readSessionSid(await cookies()));
  if (!user) return <PublicQrLanding scanLabel="Receiving carton" />;
  return <CartonRealtime>{children}</CartonRealtime>;
}
