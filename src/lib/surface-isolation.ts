/** Surface isolation — keeps Testing (/test) and Receiving (/unbox, /triage, …) URL namespaces, query params, and storage keys from… */

import {
  HISTORY_SURFACE_ROUTE,
  INCOMING_SURFACE_ROUTE,
  PICKUP_SURFACE_ROUTE,
  TRIAGE_SURFACE_ROUTE,
  UNBOX_SURFACE_ROUTE,
} from '@/lib/receiving/surface-path';
import { DASHBOARD_INBOUND_MODE } from '@/lib/dashboard/dashboard-domains';
import { parseInboundLane } from '@/lib/receiving/inbound-lane';
import {
  GRID_COLUMN_DIR_PARAM,
  GRID_COLUMN_SORT_PARAM,
} from '@/lib/tables/grid-column-sort-params';
import type { ReceivingMode } from '@/components/sidebar/receiving/receiving-sidebar-shared';

/** Dashboard route — hosts the inbound-cartons mode (`?mode=inbound`). */
const DASHBOARD_SURFACE_ROUTE = '/dashboard';

/** Canonical Quality Control route (`/test`). The Picker desk (`/pick`) is not a testing surface. */
const TESTING_SURFACE_ROUTE = '/test';

/** Legacy alias — proxy normalizes `/tech` → `/test`. */
const TESTING_SURFACE_LEGACY_ROUTE = '/tech';

/** API `view=` values that belong on `/api/qc/receiving-lines` only. */
const TESTING_API_VIEWS = ['testing', 'needs-test', 'testing_opened'] as const;

type TestingApiView = (typeof TESTING_API_VIEWS)[number];

export function isTestingApiView(view: string | null | undefined): view is TestingApiView {
  const v = String(view ?? '').trim().toLowerCase();
  return v === 'testing' || v === 'needs-test' || v === 'testing_opened';
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
  // Inbound History graduated to a `/dashboard` mode (`?mode=inbound`); the lines table it mounts is the same History feed (view=activity),…
  if (path.startsWith(DASHBOARD_SURFACE_ROUTE)) {
    return searchParams.get('mode') === DASHBOARD_INBOUND_MODE ? 'history' : 'receive';
  }
  if (path.startsWith(UNBOX_SURFACE_ROUTE)) return 'receive';
  if (path.startsWith(TRIAGE_SURFACE_ROUTE)) return 'triage';
  // Inbound desk: Pipeline (incoming) | Docked (history / former Receiving Board).
  if (path.startsWith(INCOMING_SURFACE_ROUTE)) {
    return parseInboundLane(searchParams.get('lane')) === 'docked' ? 'history' : 'incoming';
  }
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
  if (isTestingSurfacePath(pathname)) {
    next.delete('mode');
    next.delete('unboxview');
    next.delete('triview');
    next.delete('incview');
    next.delete('triq');
    next.delete('state');
    next.delete('sort');
    // `dir` pairs with `sort` — stripping one and not the other left a dangling
    // direction that re-applied itself to whatever sort Testing resolved next.
    next.delete('dir');
    // Spreadsheet COLUMN sort. Testing mounts the receiving spreadsheet too, so
    // a column sort picked on a receiving surface would otherwise ride into
    // /test and name a column Testing's list may not contain.
    next.delete(GRID_COLUMN_SORT_PARAM);
    next.delete(GRID_COLUMN_DIR_PARAM);
    next.delete('po_from');
    next.delete('po_to');
    next.delete('page');
  }
  return next;
}

/** Base URL for testing-only receiving-line feeds. */
export const QC_RECEIVING_LINES_API = '/api/qc/receiving-lines';
