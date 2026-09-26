import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { resolveGs1 } from '@/lib/gs1/resolver';
import { PublicQrLanding } from '@/components/qr/public-qr-landing';

/** /414/[gln]/254/[code] — GS1 Digital Link landing for a warehouse location. */
export default async function LocationPage({
  params,
}: {
  params: Promise<{ gln: string; code: string }>;
}) {
  const { gln, code } = await params;
  const sid = readSessionSid(await cookies());
  const user = await getCurrentUserBySid(sid);
  if (!user) {
    return <PublicQrLanding scanLabel="Location" />;
  }
  const result = await resolveGs1(`/414/${gln}/254/${code}`, {
    isInternal: true,
    orgId: user.organizationId,
  });
  redirect(result.redirect);
}
