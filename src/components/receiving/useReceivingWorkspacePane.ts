'use client';

/**
 * Right-pane workspace orchestration for `/receiving`. Owns the focused-line
 * workspace state, the prev/next nav mirror, and the scan-in-flight loader, and
 * keeps the pane authoritative across the full lifecycle:
 *   - workspace open/close/update + nav-state (dispatched by the sidebar)
 *   - the skeleton loader's grace-delay show / lingered clear around a scan
 *   - browse-first Unbox (no never-blank auto-open)
 *   - delete recovery onto an empty browse pane
 *
 * Reads the live `?mode=` so a client-side mode switch is honored without a
 * render lag. Extracted from ReceivingDashboard; behaviour is unchanged.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import { dispatchSelectLine, mergeReceivingPackageMetaIntoRow } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ScanIntakeSurface } from '@/lib/receiving/scan';

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
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [nav, setNav] = useState<NavState | null>(null);
  const [scanInFlight, setScanInFlight] = useState<
    { tracking: string; startedAt: number; surface: ScanIntakeSurface } | null
  >(null);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<WorkspaceState | null>).detail;
      if (!detail || !detail.row) return;
      setWorkspace(detail);
    };
    const handleClose = () => {
      setWorkspace(null);
      setNav(null);
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
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NavState | null>).detail;
      setNav(detail ?? null);
    };
    window.addEventListener('receiving-workspace-nav-state', handler);
    return () => window.removeEventListener('receiving-workspace-nav-state', handler);
  }, []);

  // Deep-link: cmd+k emits /unbox?openReceivingId=<receiving.id> (param read
  // path-agnostically, so the legacy /receiving?…&openReceivingId= still works).
  // Resolve that carton's first line (receiving.id → /api/receiving-lines
  // ?receiving_id=) and select it once via dispatchSelectLine, so the right pane
  // opens AND the sidebar/rail highlight stay in sync. Best-effort: a missing or
  // empty carton just no-ops, and the "never blank" effect (which is deferred
  // while the param is present) resumes once it clears from the URL.
  const deepLinkedReceivingRef = useRef<string | null>(null);
  useEffect(() => {
    const target = searchParams.get('openReceivingId');
    if (!target || !/^\d+$/.test(target)) return;
    if (deepLinkedReceivingRef.current === target) return;
    deepLinkedReceivingRef.current = target;
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
        if (!cancelled && rows[0]) dispatchSelectLine(rows[0]);
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
  const workspaceRef = useRef<WorkspaceState | null>(null);
  workspaceRef.current = workspace;
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
  }, [searchParams]);

  // Recover the right pane after the line it's showing is removed — the single
  // line, or the whole carton it belongs to. Browse-first Unbox: clear to the
  // feed (no auto-open replacement). Triage / other modes: close the workspace.
  const recoverRightPane = useCallback(
    (isDeleted: (row: ReceivingLineRow) => boolean) => {
      void isDeleted; // kept for call-site symmetry with prior auto-open recovery
      recoveringRef.current = true;
      setWorkspace(null);
      setNav(null);
      dispatchReceivingWorkspaceClose();
      window.dispatchEvent(new CustomEvent('receiving-clear-line'));
      recoveringRef.current = false;
    },
    [],
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
