/**
 * Surface isolation — keeps Testing (/test) and Receiving (/unbox, /triage, …)
 * URL namespaces, query params, and storage keys from bleeding into each other.
 *
 * Receiving modes are path-first (graduated routes); Testing modes are
 * `?view=testing` on `/test` only (legacy `?view=testing-history` redirects
 * to `?view=testing` — the tested-lines browse is Testing's empty state).
 */

import {
  HISTORY_SURFACE_ROUTE,
  INCOMING_SURFACE_ROUTE,
  PICKUP_SURFACE_ROUTE,
  TRIAGE_SURFACE_ROUTE,
  UNBOX_SURFACE_ROUTE,
  receivingSurfaceBasePath,
} from '@/lib/receiving/surface-path';
import { DASHBOARD_INBOUND_MODE } from '@/lib/dashboard/dashboard-domains';
import type { ReceivingMode } from '@/components/sidebar/receiving/receiving-sidebar-shared';

/** Dashboard route — hosts the inbound-cartons mode (`?mode=inbound`). */
const DASHBOARD_SURFACE_ROUTE = '/dashboard';

/** Canonical Testing station route (`/test`). */
export const TESTING_SURFACE_ROUTE = '/test';

/** Legacy alias — proxy normalizes `/tech` → `/test`. */
export const TESTING_SURFACE_LEGACY_ROUTE = '/tech';

/** Query params owned exclusively by the Testing surface. */
export const TESTING_SCOPED_PARAMS = ['view', 'testTab'] as const;

/** API `view=` values that belong on `/api/testing/receiving-lines` only. */
export const TESTING_API_VIEWS = ['testing', 'needs-test'] as const;

export type TestingApiView = (typeof TESTING_API_VIEWS)[number];

export function isTestingApiView(view: string | null | undefined): view is TestingApiView {
  const v = String(view ?? '').trim().toLowerCase();
  return v === 'testing' || v === 'needs-test';
}

export function isTestingSurfacePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === TESTING_SURFACE_ROUTE ||
    pathname.startsWith(`${TESTING_SURFACE_ROUTE}/`) ||
    pathname === TESTING_SURFACE_LEGACY_ROUTE ||
    pathname.startsWith(`${TESTING_SURFACE_LEGACY_ROUTE}/`)
  );
}

export function isReceivingSurfacePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (isTestingSurfacePath(pathname)) return false;
  const base = receivingSurfaceBasePath(pathname);
  if (base !== '/receiving') return true;
  return pathname === '/receiving' || pathname.startsWith('/receiving/');
}

/**
 * Path-first receiving mode — mirrors `useReceivingMode` without React hooks so
 * event listeners and other non-hook code can detect History on `/receiving/history`
 * even when `?mode=history` is absent.
 */
export function resolveLiveReceivingMode(
  pathname: string | null | undefined,
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): ReceivingMode {
  const path = pathname ?? '';
  // Inbound History graduated to a `/dashboard` mode (`?mode=inbound`); the
  // lines table it mounts is the same History feed (view=activity), so the
  // dashboard's inbound domain resolves to `history` here. Every other
  // `/dashboard` mode is outbound orders and never reaches this table.
  if (path.startsWith(DASHBOARD_SURFACE_ROUTE)) {
    return searchParams.get('mode') === DASHBOARD_INBOUND_MODE ? 'history' : 'receive';
  }
  if (path.startsWith(UNBOX_SURFACE_ROUTE)) return 'receive';
  if (path.startsWith(TRIAGE_SURFACE_ROUTE)) return 'triage';
  if (path.startsWith(INCOMING_SURFACE_ROUTE)) return 'incoming';
  if (path.startsWith(PICKUP_SURFACE_ROUTE)) return 'pickup';
  if (path.startsWith(HISTORY_SURFACE_ROUTE)) return 'history';

  const rawMode = searchParams.get('mode');
  if (rawMode === 'pickup') return 'pickup';
  if (rawMode === 'history') return 'history';
  if (rawMode === 'incoming') return 'incoming';
  if (rawMode === 'triage') return 'triage';
  return 'receive';
}

/** Strip params that belong to the other surface family. */
export function stripCrossSurfaceParams(
  pathname: string | null | undefined,
  params: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (isReceivingSurfacePath(pathname)) {
    for (const key of TESTING_SCOPED_PARAMS) next.delete(key);
  }
  if (isTestingSurfacePath(pathname)) {
    next.delete('mode');
    next.delete('unboxview');
    next.delete('triview');
    next.delete('incview');
    next.delete('triq');
    next.delete('state');
    next.delete('sort');
    next.delete('po_from');
    next.delete('po_to');
    next.delete('page');
  }
  return next;
}

/** Base URL for testing-only receiving-line feeds. */
export const TESTING_RECEIVING_LINES_API = '/api/testing/receiving-lines';
