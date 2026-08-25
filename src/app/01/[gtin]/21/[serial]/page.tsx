import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { resolveGs1 } from '@/lib/gs1/resolver';
import { PublicQrLanding } from '@/app/_label-landing/public-qr-landing';

/**
 * /01/[gtin]/21/[serial] — GS1 Digital Link landing for a unique unit.
 *
 * Dual-audience, same contract as the GTIN-only sibling and `/m/r/[id]`:
 *   staff → /serial/{serial} (the canonical unit page — proxy.ts also
 *           rewrites /m/u/* here)
 *   anon  → the branded interstitial for the tenant that owns the slug host,
 *           never a hardcoded storefront
 *
 * This is the path unit labels now mint when the org slug and a GTIN are both
 * known, so it is the consumer-facing half of the printed unit sticker.
 */
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
