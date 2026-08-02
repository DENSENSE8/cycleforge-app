import { headers } from 'next/headers';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';
import { getPublicLandingUrl } from '@/lib/tenancy/settings';
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
  const fallback = {
    brandName: 'Cycle Forge',
    logoUrl: null,
    scanLabel: args.scanLabel,
    publicLandingUrl: '',
  };

  let slug = (args.slug ?? '').trim().toLowerCase();
  if (!slug) {
    const hdrs = await headers();
    slug = (hdrs.get('x-tenant-slug') || '').trim().toLowerCase();
  }
  if (!slug) return fallback;

  const org = await getOrganizationBySlug(slug);
  if (!org) return fallback;

  return {
    brandName: (org.settings.brand?.name || '').trim() || org.name || slug,
    logoUrl: (org.settings.brand?.logoUrl || '').trim() || null,
    scanLabel: args.scanLabel,
    publicLandingUrl: getPublicLandingUrl(org.settings),
  };
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
