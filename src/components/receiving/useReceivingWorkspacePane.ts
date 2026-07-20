'use client';

/**
 * Right-pane workspace orchestration for `/receiving`. Owns the focused-line
 * workspace state, the prev/next nav mirror, and the scan-in-flight loader, and
 * keeps the pane authoritative across the full lifecycle:
 *   - workspace open/close/update + nav-state (dispatched by the sidebar)
 *   - the skeleton loader's grace-delay show / lingered clear around a scan
 *   - browse-first Unbox (no never-blank auto-open)
 *   - delete recovery onto an empty browse pane
 *   - Unbox URL stickiness (`?openReceivingId=` / `?lineId=`) so refresh
 *     reopens the edit overlay instead of the browse crossfade
 *
 * Reads the live `?mode=` so a client-side mode switch is honored without a
 * render lag. Extracted from ReceivingDashboard; behaviour is unchanged.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import { dispatchSelectLine, mergeReceivingPackageMetaIntoRow } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ScanIntakeSurface } from '@/lib/receiving/scan';
import {
  receivingSurfaceBasePath,
  UNBOX_SURFACE_ROUTE,
} from '@/lib/receiving/surface-path';
import {
  applyUnboxOpenReceivingParams,
  pickReceivingLineForDeepLink,
} from '@/lib/receiving/unbox-selection-url';

export interface WorkspaceState {
  row: ReceivingLineRow;
  accordionBootstrap: 'default' | 'all';
  scanDriven: boolean;
}

export interface NavState {
  currentIndex: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
}

export interface ReceivingWorkspacePane {
  workspace: WorkspaceState | null;
  setWorkspace: React.Dispatch<React.SetStateAction<WorkspaceState | null>>;
  nav: NavState | null;
  setNav: React.Dispatch<React.SetStateAction<NavState | null>>;
  scanInFlight: { tracking: string; startedAt: number; surface: ScanIntakeSurface } | null;
}

export function useReceivingWorkspacePane(): ReceivingWorkspacePane {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [nav, setNav] = useState<NavState | null>(null);
  const [scanInFlight, setScanInFlight] = useState<
    { tracking: string; startedAt: number; surface: ScanIntakeSurface } | null
  >(null);

  const isUnboxSurface =
    receivingSurfaceBasePath(pathname) === UNBOX_SURFACE_ROUTE;

  // Pending open key we've written locally but whose router.replace may still
  // be in flight — prevents the deep-link effect from re-fetching mid-sync.
  const pendingOpenKeyRef = useRef<string | null>(null);
  // After close, ignore a stale openReceivingId until the URL catches up
  // (same race as dashboard ignoredOpenOrderIdRef).
  const ignoredOpenKeyRef = useRef<string | null>(null);
  // Eager mirror for event handlers (declared before the listener effect).
  const workspaceRef = useRef<WorkspaceState | null>(null);
  workspaceRef.current = workspace;

  const replaceUnboxOpenReceiving = useCallback(
    (selection: { receivingId: number; lineId?: number | null } | null) => {
      if (!isUnboxSurface) return;
      const params = new URLSearchParams(searchParams.toString());
      applyUnboxOpenReceivingParams(params, selection);
      const nextSearch = params.toString();
      const currentSearch = searchParams.toString();
      if (nextSearch === currentSearch) return;
      const base = UNBOX_SURFACE_ROUTE;
      router.replace(nextSearch ? `${base}?${nextSearch}` : base, { scroll: false });
    },
    [isUnboxSurface, router, searchParams],
  );

  const syncUnboxOpenUrl = useCallback(
    (row: ReceivingLineRow | null) => {
      if (!isUnboxSurface) return;
      const receivingId = row?.receiving_id;
      if (row != null && receivingId != null && Number.isFinite(Number(receivingId))) {
        const nextKey = `${receivingId}:${row.id}`;
        const currentOpen = searchParams.get('openReceivingId');
        const currentLine = searchParams.get('lineId');
        if (currentOpen === String(receivingId) && currentLine === String(row.id)) {
          pendingOpenKeyRef.current = null;
          ignoredOpenKeyRef.current = null;
          return;
        }
        pendingOpenKeyRef.current = nextKey;
        ignoredOpenKeyRef.current = null;
        replaceUnboxOpenReceiving({ receivingId: Number(receivingId), lineId: row.id });
        return;
      }
      const currentOpen = searchParams.get('openReceivingId');
      const currentLine = searchParams.get('lineId');
      if (currentOpen || currentLine || searchParams.get('recvId')) {
        if (currentOpen) {
          ignoredOpenKeyRef.current = `${currentOpen}:${currentLine ?? ''}`;
        }
        pendingOpenKeyRef.current = null;
        replaceUnboxOpenReceiving(null);
      }
    },
    [isUnboxSurface, replaceUnboxOpenReceiving, searchParams],
  );

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<WorkspaceState | null>).detail;
      if (!detail || !detail.row) return;
      workspaceRef.current = detail;
      setWorkspace(detail);
      syncUnboxOpenUrl(detail.row);
    };
    const handleClose = () => {
      // Bridge fires close on mount when selectedLine is still null — must not
      // wipe ?openReceivingId= before the deep-link restore effect runs.
      const shouldClearUrl =
        workspaceRef.current != null || pendingOpenKeyRef.current != null;
      workspaceRef.current = null;
      setWorkspace(null);
      setNav(null);
      if (shouldClearUrl) syncUnboxOpenUrl(null);
    };
    const handleUpdate = (e: Event) => {
      const partial = (e as CustomEvent<Partial<ReceivingLineRow> & { id: number }>).detail;
      if (!partial || typeof partial.id !== 'number') return;
      setWorkspace((prev) =>
        prev && prev.row.id === partial.id
          ? { ...prev, row: { ...prev.row, ...partial } as ReceivingLineRow }
          : prev,
      );
    };
    // Scan-loader events: sidebar dispatches in-flight at scan submit; resolved
    // when the response lands. Soft-swap workspaces update in place — clear the
    // loader immediately on resolve (no linger that stacks with a remount).
    // Grace delay before the skeleton takeover mounts. A scan that resolves from
    // Phase-0 cache under this threshold flips inline and never flashes the
    // loader. (Standard skeleton-delay: never flash for sub-threshold latencies.)
    const SCAN_LOADER_GRACE_MS = 300;
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    const handleInFlight = (e: Event) => {
      const detail = (e as CustomEvent<{ tracking: string; startedAt: number; surface?: ScanIntakeSurface }>).detail;
      if (!detail?.tracking) return;
      // Surface tags the scan to its mode so the right pane renders the matching
      // per-mode skeleton (unbox vs triage) — the two never share a display.
      // Legacy dispatches without a surface default to 'unbox'.
      const surface: ScanIntakeSurface = detail.surface === 'triage' ? 'triage' : 'unbox';
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        setScanInFlight({ tracking: detail.tracking, startedAt: detail.startedAt, surface });
        showTimer = null;
      }, SCAN_LOADER_GRACE_MS);
    };
    const handleResolved = () => {
      // Resolved before the grace delay elapsed → cancel the pending show.
      // Otherwise clear immediately so soft-swapped content is not covered.
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      setScanInFlight(null);
    };

    const handlePackageMeta = (e: Event) => {
      const detail = (e as CustomEvent<Parameters<typeof mergeReceivingPackageMetaIntoRow>[1]>).detail;
      if (!detail || detail.receiving_id == null) return;
      setWorkspace((prev) => {
        if (!prev || prev.row.receiving_id !== detail.receiving_id) return prev;
        const merged = mergeReceivingPackageMetaIntoRow(prev.row, detail);
        return merged ? { ...prev, row: merged } : prev;
      });
    };

    window.addEventListener('receiving-workspace-open', handleOpen);
    window.addEventListener('receiving-workspace-close', handleClose);
    window.addEventListener('receiving-line-updated', handleUpdate);
    window.addEventListener('receiving-package-updated', handlePackageMeta);
    window.addEventListener('receiving-scan-in-flight', handleInFlight);
    window.addEventListener('receiving-scan-resolved', handleResolved);
    return () => {
      window.removeEventListener('receiving-workspace-open', handleOpen);
      window.removeEventListener('receiving-workspace-close', handleClose);
      window.removeEventListener('receiving-line-updated', handleUpdate);
      window.removeEventListener('receiving-package-updated', handlePackageMeta);
      window.removeEventListener('receiving-scan-in-flight', handleInFlight);
      window.removeEventListener('receiving-scan-resolved', handleResolved);
      if (showTimer) clearTimeout(showTimer);
    };
  }, [syncUnboxOpenUrl]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NavState | null>).detail;
      setNav(detail ?? null);
    };
    window.addEventListener('receiving-workspace-nav-state', handler);
    return () => window.removeEventListener('receiving-workspace-nav-state', handler);
  }, []);

  // Deep-link: cmd+k / search / refresh stickiness emit
  // /unbox?openReceivingId=<receiving.id>&lineId=<optional>. Resolve the carton
  // (prefer lineId) via /api/receiving-lines and select once so the right pane
  // opens AND the sidebar/rail highlight stay in sync. Best-effort: missing /
  // empty carton no-ops. Param is path-agnostic so legacy /receiving?… still works.
  const deepLinkedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const target = searchParams.get('openReceivingId');
    if (!target || !/^\d+$/.test(target)) {
      deepLinkedKeyRef.current = null;
      return;
    }
    const lineIdParam = searchParams.get('lineId');
    const deepLinkKey = `${target}:${lineIdParam ?? ''}`;
    if (ignoredOpenKeyRef.current === deepLinkKey) return;
    if (pendingOpenKeyRef.current === deepLinkKey) {
      // Local open already wrote this URL — skip re-fetch; clear pending once URL matches.
      deepLinkedKeyRef.current = deepLinkKey;
      pendingOpenKeyRef.current = null;
      return;
    }
    if (deepLinkedKeyRef.current === deepLinkKey) return;
    deepLinkedKeyRef.current = deepLinkKey;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/receiving-lines?receiving_id=${target}&include=serials`,
          { cache: 'no-store' },
        );
        const data = res.ok ? await res.json().catch(() => null) : null;
        const rows = Array.isArray(data?.receiving_lines)
          ? (data.receiving_lines as ReceivingLineRow[])
          : [];
        const pick = pickReceivingLineForDeepLink(rows, lineIdParam);
        if (!cancelled && pick) dispatchSelectLine(pick);
      } catch {
        /* deep-link is best-effort; a network blip just no-ops */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Browse-first for Unbox: do NOT auto-open the most-recent line. Operators
  // land on the Unboxed/Queue/Viewed feed (like Testing) and open a line via
  // click or scan. Deep-link `openReceivingId` still opens via the effect above.
  // Guards delete-recovery while choosing the next line so it doesn't race.
  const recoveringRef = useRef(false);
  // Any mode switch must drop the focused workspace from state — even though
  // ReceivingRightPane hides the overlay via isTableOnlyMode / presence keys,
  // stale state lets a late receiving-workspace-open or a zero-duration race
  // repaint the prior mode's panel (Triage ↔ Unbox ↔ History bleed).
  const prevModeForWorkspaceRef = useRef<string | null>(null);
  useEffect(() => {
    const liveMode = searchParams.get('mode') ?? 'receive';
    const prev = prevModeForWorkspaceRef.current;
    prevModeForWorkspaceRef.current = liveMode;
    if (prev === null || prev === liveMode) return;
    setWorkspace(null);
    setNav(null);
    setScanInFlight(null);
    syncUnboxOpenUrl(null);
  }, [searchParams, syncUnboxOpenUrl]);

  // Recover the right pane after the line it's showing is removed — the single
  // line, or the whole carton it belongs to. Browse-first Unbox: clear to the
  // feed (no auto-open replacement). Triage / other modes: close the workspace.
  const recoverRightPane = useCallback(
    (isDeleted: (row: ReceivingLineRow) => boolean) => {
      void isDeleted; // kept for call-site symmetry with prior auto-open recovery
      recoveringRef.current = true;
      setWorkspace(null);
      setNav(null);
      syncUnboxOpenUrl(null);
      dispatchReceivingWorkspaceClose();
      window.dispatchEvent(new CustomEvent('receiving-clear-line'));
      recoveringRef.current = false;
    },
    [syncUnboxOpenUrl],
  );

  // Single line removed (e.g. last item pulled from an unmatched carton).
  useEffect(() => {
    const handler = (e: Event) => {
      const deletedId = (e as CustomEvent<{ id?: number }>).detail?.id;
      if (typeof deletedId !== 'number') return;
      if (workspaceRef.current?.row.id !== deletedId) return;
      recoverRightPane((r) => r.id === deletedId);
    };
    window.addEventListener('receiving-line-deleted', handler);
    return () => window.removeEventListener('receiving-line-deleted', handler);
  }, [recoverRightPane]);

  // Whole carton (receiving log) removed via the detail panel. Carries the
  // carton id as a bare-number detail. If the line on screen belongs to it, jump
  // to the most-recent survivor.
  useEffect(() => {
    const handler = (e: Event) => {
      const cartonId = Number((e as CustomEvent<unknown>).detail);
      if (!Number.isFinite(cartonId)) return;
      if (workspaceRef.current?.row.receiving_id !== cartonId) return;
      recoverRightPane((r) => r.receiving_id === cartonId);
    };
    window.addEventListener('receiving-entry-deleted', handler);
    return () => window.removeEventListener('receiving-entry-deleted', handler);
  }, [recoverRightPane]);

  return { workspace, setWorkspace, nav, setNav, scanInFlight };
}
