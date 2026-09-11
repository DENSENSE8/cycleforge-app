/**
 * Pure mapping for the anonymous Digital Link interstitial.
 * Kept free of `server-only` / `next/cache` so unit tests can import it.
 */

import { getPublicLandingUrl, type OrgSettings } from '@/lib/tenancy/settings';

export const PUBLIC_QR_BRAND_FALLBACK_NAME = 'Cycle Forge';

export type PublicQrBrand = {
  brandName: string;
  logoUrl: string | null;
  publicLandingUrl: string;
};

export const EMPTY_PUBLIC_QR_BRAND: PublicQrBrand = {
  brandName: PUBLIC_QR_BRAND_FALLBACK_NAME,
  logoUrl: null,
  publicLandingUrl: '',
};

export function publicQrBrandFromOrg(input: {
  slug: string;
  name: string;
  settings: OrgSettings;
}): PublicQrBrand {
  const slug = input.slug.trim().toLowerCase();
  return {
    brandName: (input.settings.brand?.name || '').trim() || input.name || slug,
    logoUrl: (input.settings.brand?.logoUrl || '').trim() || null,
    publicLandingUrl: getPublicLandingUrl(input.settings),
  };
}
