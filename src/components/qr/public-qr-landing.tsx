import { headers } from 'next/headers';
import { getPublicQrBrand } from '@/lib/tenancy/public-qr-brand';
import { PublicQrInterstitial } from '@/components/qr/PublicQrInterstitial';

/**
 * The one anonymous landing for every platform-minted Digital Link.
 *
 * A printed sticker has exactly two audiences and they scan the *same* URL:
 * a staff wedge (which ignores the host and routes internally) and a customer's
 * phone. This resolves the second one — tenant brand + the workspace's own
 * configured website — so no printed code ever hard-redirects a consumer to a
 * hardcoded storefront that belongs to one tenant.
 *
 * Tenant comes from the slug host (`x-tenant-slug`, set by the proxy). Fail
 * closed: an unknown or absent slug still renders the shell, unbranded and
 * with no CTA, rather than leaking a default tenant's website.
 *
 * Brand fields are Next Data Cache (`getPublicQrBrand`); org-settings writes
 * bust the tag via `invalidateOrgCache`.
 */
async function resolvePublicQrLanding(args: {
  /** What was scanned — e.g. "Receiving carton", "Product". */
  scanLabel: string;
  /** Override the header-derived slug (tests / nested routes). */
  slug?: string | null;
}): Promise<{
  brandName: string;
  logoUrl: string | null;
  scanLabel: string;
  publicLandingUrl: string;
}> {
  let slug = (args.slug ?? '').trim().toLowerCase();
  if (!slug) {
    const hdrs = await headers();
    slug = (hdrs.get('x-tenant-slug') || '').trim().toLowerCase();
  }
  const brand = await getPublicQrBrand(slug);
  return { ...brand, scanLabel: args.scanLabel };
}

/** Render the anonymous landing for a scanned platform Digital Link. */
export async function PublicQrLanding({
  scanLabel,
  slug,
}: {
  scanLabel: string;
  slug?: string | null;
}) {
  const props = await resolvePublicQrLanding({ scanLabel, slug });
  return <PublicQrInterstitial {...props} />;
}
