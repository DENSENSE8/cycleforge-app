/** Anonymous Digital Link brand payload — Next Data Cache, not the 30s in-process org map. */

import 'server-only';
import { unstable_cache } from 'next/cache';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';
import { PUBLIC_QR_BRAND_TAG, publicQrBrandTagForSlug } from '@/lib/tenancy/public-qr-brand-tag';
import {
  EMPTY_PUBLIC_QR_BRAND,
  publicQrBrandFromOrg,
  type PublicQrBrand,
} from '@/lib/tenancy/public-qr-brand-map';

export type { PublicQrBrand };
export { EMPTY_PUBLIC_QR_BRAND, publicQrBrandFromOrg } from '@/lib/tenancy/public-qr-brand-map';

const BRAND_REVALIDATE_SEC = 60 * 60;

async function loadPublicQrBrand(slug: string): Promise<PublicQrBrand> {
  const org = await getOrganizationBySlug(slug);
  if (!org) return EMPTY_PUBLIC_QR_BRAND;
  return publicQrBrandFromOrg({ slug: org.slug, name: org.name, settings: org.settings });
}

export async function getPublicQrBrand(slug: string): Promise<PublicQrBrand> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return EMPTY_PUBLIC_QR_BRAND;
  return unstable_cache(loadPublicQrBrand, ['public-qr-brand', normalized], {
    revalidate: BRAND_REVALIDATE_SEC,
    tags: [PUBLIC_QR_BRAND_TAG, publicQrBrandTagForSlug(normalized)],
  })(normalized);
}
