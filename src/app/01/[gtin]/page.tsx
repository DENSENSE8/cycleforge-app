import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { resolveGs1 } from '@/lib/gs1/resolver';
import { PublicQrLanding } from '@/app/_label-landing/public-qr-landing';

/**
 * /01/[gtin] — GS1 Digital Link landing for a product class (no serial).
 *
 * Dual-audience, same contract as `/m/r/[id]`:
 *   staff → the shared resolver (SKU lookup → /products/sku/{sku}, /inventory
 *           when the GTIN isn't registered)
 *   anon  → the branded interstitial for the tenant that owns the slug host
 *
 * The anon branch used to 302 straight to `NEXT_PUBLIC_STOREFRONT_URL`
 * (defaulting to the dogfood tenant's shop). That is wrong the moment unit
 * labels mint on `{slug}.app.cycleforge.ai`: one tenant's sticker would have
 * sent a customer to a different tenant's storefront.
 *
 * Listed in `PUBLIC_PATHS` / `CLIENT_PUBLIC_PATHS` so the edge proxy doesn't
 * bounce anon traffic to /signin before we get here.
 */
export default async function GtinPage({
  params,
}: {
  params: Promise<{ gtin: string }>;
}) {
  const { gtin } = await params;
  const sid = readSessionSid(await cookies());
  const user = await getCurrentUserBySid(sid);
  if (!user) {
    return <PublicQrLanding scanLabel="Product" />;
  }
  const result = await resolveGs1(`/01/${gtin}`, {
    isInternal: true,
    orgId: user.organizationId,
  });
  redirect(result.redirect);
}
