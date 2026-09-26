import { withJobReturn } from '@/lib/mobile/nav-trail';

/** `/m/fnsku/[fnsku]` — a scanned FBA unit label's full-screen record. */
export function fnskuHubPath(fnsku: string): string {
  return `/m/fnsku/${encodeURIComponent(fnsku)}`;
}

/** The hub as opened from the scan loop: its X returns to `/m/scan`. */
export function fnskuHubHref(fnsku: string): string {
  return withJobReturn(fnskuHubPath(fnsku), '/m/scan');
}
