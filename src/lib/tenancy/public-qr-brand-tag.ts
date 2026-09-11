/**
 * Next Data Cache tag for anonymous Digital Link brand payloads.
 * Keep this module free of `@/lib/db` so `organizations.ts` can bust the
 * tag without a cycle through the brand loader.
 */

export const PUBLIC_QR_BRAND_TAG = 'public-qr-brand';

export function publicQrBrandTagForSlug(slug: string): string {
  return `${PUBLIC_QR_BRAND_TAG}:${slug.trim().toLowerCase()}`;
}

/** Bust every public-QR brand entry. Safe outside a Next request (no-op). */
export function revalidatePublicQrBrandCache(): void {
  void import('next/cache')
    .then(({ revalidateTag }) => {
      try {
        revalidateTag(PUBLIC_QR_BRAND_TAG, 'max');
      } catch {
        /* scripts / tests / no incrementalCache */
      }
    })
    .catch(() => {
      /* next/cache unavailable */
    });
}
