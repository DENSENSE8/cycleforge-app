'use client';

/**
 * URL ⇄ state for the receiving sidebar's mode switcher and Unbox sub-view.
 *
 * The sidebar-mode contract keeps `mode` / `unboxview` / `triview` in the URL so
 * a refresh or deep-link is preserved. This hook centralizes the parsing + the
 * `router.replace` navigation helpers, and fires the cross-pane focus/clear
 * events that a mode change implies. Extracted from ReceivingSidebarPanel;
 * behaviour is unchanged.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  UNBOX_SURFACE_ROUTE,
  TRIAGE_SURFACE_ROUTE,
  INCOMING_SURFACE_ROUTE,
  PICKUP_SURFACE_ROUTE,
  REPAIR_SURFACE_ROUTE,
  HISTORY_SURFACE_ROUTE,
  receivingSurfaceBasePath,
} from '@/lib/receiving/surface-path';
import { RECEIVING_MODE_ROUTE_PARAMS } from '@/lib/routing/receiving-routes';
import { routeParamsFor } from '@/lib/routing/registry';
import { buildRouteUrl, parseRouteParams } from '@/lib/routing/route-params';
import type { ReceivingMode } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import {
  normalizeTriageWorkspaceTabParams,
  resolveTriageView,
  type TriageWorkspaceTab,
} from '@/utils/triage-workspace-state';

/** Unbox sub-view from `?unboxview=` — internal to this hook (URL ↔ state). */
type UnboxView = 'recent' | 'queue' | 'viewed';

export interface ReceivingModeState {
  /** Active sidebar mode parsed from `?mode=` (defaults to `receive`). */
  mode: ReceivingMode;
  /** Unbox sub-view from `?unboxview=` (defaults to `recent`). */
  unboxView: UnboxView;
  /** Triage sub-view from `?triview=` (defaults to `triage`). */
  triageView: TriageWorkspaceTab;
  /** Triage carton-list filter text from `?triq=` (D1 — finds a carton already scanned in, not a Zoho search). */
  triageQuery: string;
  /**
   * True for the two surfaces that show the scan bar + recent rail
   * (`receive` = Unbox workspace, `triage` = Receiving). Only the right pane
   * differs between them.
   */
  isScanSurface: boolean;
  /** Swap the `?mode=` param (clears History params when leaving History). */
  updateMode: (next: ReceivingMode) => void;
  /** Set the canonical `?staff=` filter param (P1-WORK-02). */
  updateStaff: (id: number) => void;
  /** Swap the Unbox `?unboxview=` sub-view. Clears the current line by default. */
  updateUnboxView: (next: UnboxView, opts?: { clearLine?: boolean }) => void;
  /** Swap the Triage `?triview=` sub-view (clears the current line first). */
  updateTriageView: (next: TriageWorkspaceTab, opts?: { clearLine?: boolean }) => void;
  /** Set (or clear, on empty string) the Triage `?triq=` carton-list filter. */
  updateTriageQuery: (next: string) => void;
}


export function useReceivingMode(): ReceivingModeState {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Being on a graduated surface route IS that mode — those routes carry no
  // `?mode=` param. Off them, derive the mode from `?mode=` as before.
  const onUnboxRoute = (pathname ?? '').startsWith(UNBOX_SURFACE_ROUTE);
  const onTriageRoute = (pathname ?? '').startsWith(TRIAGE_SURFACE_ROUTE);
  const onIncomingRoute = (pathname ?? '').startsWith(INCOMING_SURFACE_ROUTE);
  const onPickupRoute = (pathname ?? '').startsWith(PICKUP_SURFACE_ROUTE);
  const onRepairRoute = (pathname ?? '').startsWith(REPAIR_SURFACE_ROUTE);
  const onHistoryRoute = (pathname ?? '').startsWith(HISTORY_SURFACE_ROUTE);
  const rawMode = searchParams.get('mode');

  /** Legacy `?mode=` values, for URLs that predate the graduated routes. */
  const modeFromParam = (raw: string | null): ReceivingMode =>
    raw === 'pickup'
      ? 'pickup'
      : raw === 'repair'
        ? 'repair'
        : raw === 'history'
          ? 'history'
          : raw === 'incoming'
            ? 'incoming'
            : raw === 'triage'
              ? 'triage'
              : 'receive';

  const mode: ReceivingMode = onUnboxRoute
    ? 'receive'
    : onTriageRoute
      ? 'triage'
      : onIncomingRoute
        ? 'incoming'
        : onPickupRoute
          ? 'pickup'
          : onRepairRoute
            ? 'repair'
            : onHistoryRoute
              ? 'history'
              : modeFromParam(rawMode);

  // In-surface param updates (staff, sub-views) must stay on the current
  // surface's route, not hardcode `/receiving`.
  const currentBasePath = receivingSurfaceBasePath(pathname);

  // Triage (label "Arrival") shares the scan-bar + recent-rail sidebar body
  // with the Unbox workspace (`receive`); only the right pane differs.
  const isScanSurface = mode === 'receive' || mode === 'triage';

  const unboxView: UnboxView =
    searchParams.get('unboxview') === 'queue'
      ? 'queue'
      : searchParams.get('unboxview') === 'viewed'
        ? 'viewed'
        : 'recent';

  const triageView = resolveTriageView(searchParams.get('triview'));
  const triageQuery = searchParams.get('triq') ?? '';

  // Returning to a scan surface from History / Pickup / Incoming → focus the
  // tracking field. Entering Pickup → clear any open line. The scan-bar +
  // selection hooks listen for these events.
  useEffect(() => {
    if (mode === 'pickup') {
      window.dispatchEvent(new CustomEvent('receiving-clear-line'));
    }
    if (isScanSurface) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('receiving-focus-scan'));
      });
    }
  }, [mode, isScanSurface]);

  /**
   * The current URL's params, boundary-parsed for the surface we are ON. Foreign
   * keys and values that fail their schema are already gone, so an in-surface
   * edit can patch this without re-deriving what belongs here.
   */
  const surfaceParams = (): URLSearchParams => {
    const spec = routeParamsFor(currentBasePath);
    const raw = new URLSearchParams(searchParams.toString());
    return spec ? parseRouteParams(spec, raw) : raw;
  };

  const replaceOnSurface = (params: URLSearchParams) => {
    const qs = params.toString();
    router.replace(qs ? `${currentBasePath}?${qs}` : currentBasePath, { scroll: false });
  };

  const updateMode = (nextMode: ReceivingMode) => {
    // The target URL is CONSTRUCTED from a declared set — the current query
    // string is never copied forward. That is what replaced `MODE_SCOPED_PARAMS`:
    // there is no list of keys to remember to delete, because nothing rides
    // along unless it is named right here.
    //
    // The one deliberate carry is the staff filter: it is an operator-level
    // preference ("show me my cartons"), not mode state, and losing it on every
    // rail click was never the intent of the isolation rule.
    const staff = searchParams.get('staff') ?? searchParams.get('staffId');
    router.replace(buildRouteUrl(RECEIVING_MODE_ROUTE_PARAMS[nextMode], { staff }));
  };

  const updateStaff = (id: number) => {
    const nextParams = surfaceParams();
    // Canonical staff-filter param is `staff` (useStaffFilter's
    // STAFF_FILTER_PARAM). `staffId` was receiving's legacy divergence — readers
    // keep it as a read-fallback for old links, but writes emit `staff` only.
    nextParams.delete('staffId');
    nextParams.set('staff', String(id));
    replaceOnSurface(nextParams);
  };

  const updateUnboxView = (next: UnboxView, opts?: { clearLine?: boolean }) => {
    if (next === unboxView) return;
    // Different list = don't carry the prior pick; let the new list auto-select
    // its own top (mirrors the triage Found/Unfound toggle). Scan auto-switch
    // passes clearLine:false so the just-resolved workspace stays open.
    if (opts?.clearLine !== false) {
      window.dispatchEvent(new CustomEvent('receiving-clear-line'));
    }
    const nextParams = surfaceParams();
    if (next === 'recent') nextParams.delete('unboxview');
    else nextParams.set('unboxview', next);
    replaceOnSurface(nextParams);
  };

  const updateTriageView = (next: TriageWorkspaceTab, opts?: { clearLine?: boolean }) => {
    if (next === triageView) return;
    if (opts?.clearLine !== false) {
      window.dispatchEvent(new CustomEvent('receiving-clear-line'));
    }
    const nextParams = surfaceParams();
    normalizeTriageWorkspaceTabParams(nextParams, next);
    replaceOnSurface(nextParams);
  };

  const updateTriageQuery = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === triageQuery) return;
    const nextParams = surfaceParams();
    if (!trimmed) nextParams.delete('triq');
    else nextParams.set('triq', trimmed);
    replaceOnSurface(nextParams);
  };

  return {
    mode,
    unboxView,
    triageView,
    triageQuery,
    isScanSurface,
    updateMode,
    updateStaff,
    updateUnboxView,
    updateTriageView,
    updateTriageQuery,
  };
}
