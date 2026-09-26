import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { resolveGs1 } from '@/lib/gs1/resolver';
import { PublicQrLanding } from '@/components/qr/public-qr-landing';

/** /01/[gtin]/21/[serial] — GS1 Digital Link landing for a unique unit. */
export default async function GtinSerialPage({
  params,
}: {
  params: Promise<{ gtin: string; serial: string }>;
}) {
  const { gtin, serial } = await params;
  const sid = readSessionSid(await cookies());
  const user = await getCurrentUserBySid(sid);
  if (!user) {
    return <PublicQrLanding scanLabel="Product" />;
  }
  const result = await resolveGs1(`/01/${gtin}/21/${serial}`, {
    isInternal: true,
    orgId: user.organizationId,
  });
  redirect(result.redirect);
}
