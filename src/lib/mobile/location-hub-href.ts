import { withJobReturn } from '@/lib/mobile/nav-trail';

/**
 * `/m/loc/[code]` — a scanned location's full-screen record. Not `/m/b/` or
 * `/m/l/`: `src/proxy.ts` rewrites those to `/bin/` and `/receiving/lines/`.
 */
export function locationHubPath(code: string): string {
  return `/m/loc/${encodeURIComponent(code)}`;
}

/** The hub as opened from the scan loop: its X returns to `/m/scan`. */
export function locationHubHref(code: string): string {
  return withJobReturn(locationHubPath(code), '/m/scan');
}

/** Keep the short-lived scan proof in record-local navigation only. */
export function withLocationScanProof(href: string, token: string): string {
  const url = new URL(href, 'https://cycleforge.local');
  url.searchParams.set('verified', token);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The take/put keypad for one SKU in a location. `returnTo` is where Back and
 * Confirm land (the hub); `mode: 'take'` opens on − TAKE.
 */
export function locationKeypadHref(
  code: string,
  sku: string,
  {
    returnTo,
    mode,
    verificationToken,
  }: { returnTo: string; mode?: 'take' | 'put'; verificationToken?: string | null },
): string {
  const params = new URLSearchParams({ return: returnTo });
  if (mode) params.set('mode', mode);
  if (verificationToken) params.set('verified', verificationToken);
  return `/m/pair/${encodeURIComponent(code)}/${encodeURIComponent(sku)}?${params.toString()}`;
}
