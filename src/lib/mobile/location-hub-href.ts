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

/**
 * The take/put keypad for one SKU in a location. `returnTo` is where Back and
 * Confirm land (the hub); `mode: 'take'` opens on − TAKE.
 */
export function locationKeypadHref(
  code: string,
  sku: string,
  { returnTo, mode }: { returnTo: string; mode?: 'take' | 'put' },
): string {
  const params = new URLSearchParams({ return: returnTo });
  if (mode) params.set('mode', mode);
  return `/m/pair/${encodeURIComponent(code)}/${encodeURIComponent(sku)}?${params.toString()}`;
}
