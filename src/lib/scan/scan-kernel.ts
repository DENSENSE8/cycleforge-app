/**
 * The scan identification kernel — the ONE place a scan becomes a URL.
 *
 * Every hardware scan crosses `useGlobalWedgeScanner` (the waist). A scan that
 * lands in a list's Find is handed over through {@link submitScan} instead of
 * filtering the list (`FindField`). Commands, page claimers (`wedge-scan`),
 * the preview stance and station sinks keep first refusal. If none of them
 * takes the scan, it goes to its record:
 *
 * - a printed handle → its route (`routeScan().redirect`);
 * - anything else → `POST /api/scan/resolve`. One order → that order's record
 *   (desk: {@link recordDetailsHref}; phone: the resolver's `/m/orders/…`).
 *   Otherwise the resolver's own route is used.
 *
 * A scan never writes a list's find, filter or facet.
 */

import { recordDetailsHref } from '@/lib/records/record-details';
import { desktopSearchHref } from '@/lib/search/internal-id';

type ScanKernel = (value: string) => void;

let mounted: ScanKernel | null = null;

/** The waist mounts itself here once; returns the unmount. */
export function mountScanKernel(kernel: ScanKernel): () => void {
  mounted = kernel;
  return () => {
    if (mounted === kernel) mounted = null;
  };
}

/** Hand a scan to the kernel. `false` when no kernel is mounted (the caller keeps the text). */
export function submitScan(value: string): boolean {
  const scan = value.trim();
  if (!mounted || !scan) return false;
  mounted(scan);
  return true;
}

export type ScanSurface = 'desk' | 'phone';

export type ScanDestination =
  /** An order's record: opened the way its card does (in place over its own desk's list). */
  | { kind: 'record'; href: string }
  | { kind: 'href'; href: string }
  /** Several records answer — no single URL. */
  | { kind: 'ambiguous'; count: number }
  | { kind: 'none' }
  | { kind: 'error' };

/** The resolver facts the kernel reads (`/api/scan/resolve`'s `ResolveResponse`). */
export interface ScanResolveAnswer {
  matches?: ReadonlyArray<{ id?: unknown; status?: unknown }> | null;
  matchOutcome?: unknown;
  mobileRoute?: unknown;
}

/** Where a resolved scan goes on this surface. */
export function scanDestination(answer: ScanResolveAnswer, surface: ScanSurface): ScanDestination {
  const matches = answer.matches ?? [];
  const route = typeof answer.mobileRoute === 'string' && answer.mobileRoute.startsWith('/') ? answer.mobileRoute : null;
  if (answer.matchOutcome === 'multi' && matches.length > 1) return { kind: 'ambiguous', count: matches.length };
  if (surface === 'phone') return route ? { kind: 'href', href: route } : { kind: 'none' };
  if (matches.length === 1) {
    const orderId = Number(matches[0]?.id);
    if (Number.isSafeInteger(orderId) && orderId > 0) {
      const shipped = String(matches[0]?.status ?? '').trim().toLowerCase() === 'shipped';
      return { kind: 'record', href: recordDetailsHref({ kind: 'order', orderId, shipped }) };
    }
  }
  if (!route) return { kind: 'none' };
  // The resolver answers in phone routes; the desk opens the retained desktop record.
  const href = desktopSearchHref(route);
  return href === '/' ? { kind: 'none' } : { kind: 'href', href };
}

/** Ask the server resolver where `value` lives. */
export async function resolveScanDestination(
  value: string,
  surface: ScanSurface,
  pathname: string,
): Promise<ScanDestination> {
  try {
    const response = await fetch('/api/scan/resolve', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: value, device: { surface: pathname } }),
    });
    if (!response.ok) return { kind: 'error' };
    return scanDestination((await response.json()) as ScanResolveAnswer, surface);
  } catch {
    return { kind: 'error' };
  }
}
