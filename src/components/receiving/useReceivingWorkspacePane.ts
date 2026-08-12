'use client';

/**
 * Right-pane workspace orchestration for `/receiving`. Owns the focused-line
 * workspace state, the prev/next nav mirror, and the scan-in-flight loader, and
 * keeps the pane authoritative across the full lifecycle:
 *   - workspace open/close/update + nav-state (dispatched by the sidebar)
 *   - the skeleton loader's grace-delay show / lingered clear around a scan
 *   - station-first Unbox (auto-open Unboxed MRU on bare `/unbox`; desk via
 *     `?unboxdesk=1` after Back to list — never re-open MRU until resume/scan)
 *   - delete recovery onto desk (no surprise MRU reopen)
 *   - Unbox URL stickiness (`?openReceivingId=` / `?lineId=`) so refresh
 *     reopens the station overlay
 *
 * Reads the live `?mode=` so a client-side mode switch is honored without a
 * render lag. Extracted from ReceivingDashboard; behaviour is unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchSelectLine, mergeReceivingPackageMetaIntoRow } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ScanIntakeSurface } from '@/lib/receiving/scan';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import {
  receivingSurfaceBasePath,
  UNBOX_SURFACE_ROUTE,
} from '@/lib/receiving/surface-path';
import {
  applyUnboxDeskParam,
  applyUnboxOpenReceivingParams,
  pickReceivingLineForDeepLink,
  shouldAutoOpenUnboxMru,
  shouldRestoreOpenReceiving,
} from '@/lib/receiving/unbox-selection-url';
import { RECEIVING_RAIL_FEEDS } from '@/lib/receiving/rail/feeds';
import { receivingRailQueryKey } from '@/lib/receiving/rail/rail-query-key';
import { normalizeUnboxWorkspaceTabParams } from '@/utils/unbox-workspace-state';

export interface WorkspaceState {
  row: ReceivingLineRow;
  accordionBootstrap: 'default' | 'all';
  scanDriven: boolean;
  /**
   * Whether this open stamps the operator's recents (the Recent tab's feed).
   * Absent = true; only a browse-feed click opts out. See
   * `readSelectLineDetail`.
   */
  recordView?: boolean;
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
  /**
   * A deep-link restore (`?openReceivingId=`) is resolving but the overlay is
   * not open yet. Seeded synchronously from the URL so the first paint shows the
   * workspace skeleton instead of flashing the browse feed before the async
   * carton fetch lands.
   */
  restorePending: boolean;
  /**
   * The last scan resolved to a carton whose unbox work is already DONE, so it
   * was recorded as a lookup, not work. The pane shows a read-only receipt over
   * the editor until the operator dismisses it or opens anyway.
   */
  lookupReceipt: UnboxLookupScanDetail | null;
  clearLookupReceipt: () => void;
}

export function useReceivingWorkspacePane(): ReceivingWorkspacePane {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // `?openReceivingId=` is the Unbox surface's focused-carton URL SoT. The write
  // side (`syncUnboxOpenUrl`) only stamps it on `/unbox`, so the read side (the
  // restore effect below) is gated on the same surface. A stale value that rode
  // a mode switch onto Incoming/Triage must NOT restore — its
  // `dispatchSelectLine` is caught by the Incoming overlays listener and pops the
  // details panel on load.
  const isUnboxSurface =
    receivingSurfaceBasePath(pathname) === UNBOX_SURFACE_ROUTE;

  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [nav, setNav] = useState<NavState | null>(null);
  const [scanInFlight, setScanInFlight] = useState<
    { tracking: string; startedAt: number; surface: ScanIntakeSurface } | null
  >(null);
  // Seed from the URL on first render so a deep-link load shows the workspace
  // skeleton immediately — no browse-feed flash before the restore resolves.
  // Unbox-surface only: a leaked param elsewhere must not hold a phantom
  // skeleton (there is no restore for it — see the effect's gate).
  // Station-first: bare `/unbox` (auto-open MRU pending) also starts pending so
  // the empty desk sheet never flashes before the MRU resolve.
  const [restorePending, setRestorePending] = useState<boolean>(() =>
    shouldRestoreOpenReceiving(isUnboxSurface, searchParams.get('openReceivingId')) ||
      shouldAutoOpenUnboxMru(isUnboxSurface, searchParams),
  );
  const [lookupReceipt, setLookupReceipt] = useState<UnboxLookupScanDetail | null>(null);
  const clearLookupReceipt = useCallback(() => setLookupReceipt(null), []);

  // A scan of an already-unboxed carton. Announced twice on some rungs (an
  // optimistic client classification, then the authoritative server one) — the
  // second is a harmless re-set of the same carton. Typed bus, not raw
  // listeners (`receiving-events.ts` + its ratchet guard).
  useReceivingEvents({
    'receiving-lookup-scan': (detail) => {
      if (!detail || typeof detail.receivingId !== 'number') return;
      setLookupReceipt(detail);
    },
    // Any deselect / close retires a stale receipt.
    'receiving-clear-line': () => setLookupReceipt(null),
  });

  // Pending open key we've written locally but whose router.replace may still
  // be in flight — prevents the deep-link effect from re-fetching mid-sync.
  const pendingOpenKeyRef = useRef<string | null>(null);
  // After close, ignore a stale openReceivingId until the URL catches up
  // (same race as dashboard ignoredOpenOrderIdRef).
  const ignoredOpenKeyRef = useRef<string | null>(null);
  // Eager mirror for event handlers (declared before the listener effect).
  const workspaceRef = useRef<WorkspaceState | null>(null);
  workspaceRef.current = workspace;
  // Last Unboxed-rail MRU receiving_id we auto-opened (avoid re-entry loops).
  const mruOpenedReceivingIdRef = useRef<number | null>(null);

  const wantMruAutoOpen = shouldAutoOpenUnboxMru(isUnboxSurface, searchParams);
  const unboxRailStaffId = useMemo(() => {
    const feed = RECEIVING_RAIL_FEEDS.unboxRecent;
    if (!feed.usesStaffFilter) return null;
    return parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  }, [searchParams]);
  // Same key as ReceivingFeedRail's Unboxed dock — seed + rail + auto-open share it.
  const unboxRailQueryKey = useMemo(
    () =>
      receivingRailQueryKey(
        RECEIVING_RAIL_FEEDS.unboxRecent.segment,
        undefined,
        '',
        unboxRailStaffId,
      ),
    [unboxRailStaffId],
  );
  const unboxRailQuery = useQuery<ReceivingLineRow[]>({
    queryKey: unboxRailQueryKey,
    queryFn: async () => {
      const feed = RECEIVING_RAIL_FEEDS.unboxRecent;
      const data = await feed.buildFetcher!({
        staffId: unboxRailStaffId,
        query: '',
      })();
      return data.receiving_lines ?? [];
    },
    enabled: wantMruAutoOpen,
  });

  const replaceUnboxUrl = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      if (!isUnboxSurface) return;
      const seed =
        typeof window !== 'undefined' ? window.location.search : searchParams.toString();
      const params = new URLSearchParams(seed);
      mutate(params);
      const nextSearch = params.toString();
      const currentSearch =
        typeof window !== 'undefined'
          ? window.location.search.replace(/^\?/, '')
          : searchParams.toString();
      if (nextSearch === currentSearch) return;
      const base = UNBOX_SURFACE_ROUTE;
      router.replace(nextSearch ? `${base}?${nextSearch}` : base, { scroll: false });
    },
    [isUnboxSurface, router, searchParams],
  );

  const replaceUnboxOpenReceiving = useCallback(
    (selection: { receivingId: number; lineId?: number | null } | null) => {
      replaceUnboxUrl((params) => {
        applyUnboxOpenReceivingParams(params, selection);
        // Opening a carton exits desk; closing alone does not enter desk
        // (Back to list / recover call enterUnboxDesk).
        if (selection != null) applyUnboxDeskParam(params, false);
      });
    },
    [replaceUnboxUrl],
  );

  /** Back to list / delete recovery — clear carton + enter desk (tables). */
  const enterUnboxDesk = useCallback(() => {
    replaceUnboxUrl((params) => {
      applyUnboxOpenReceivingParams(params, null);
      applyUnboxDeskParam(params, true);
      // Recent = touched set under the carton (resume CTA parity).
      normalizeUnboxWorkspaceTabParams(params, 'recent');
    });
  }, [replaceUnboxUrl]);

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
          // Still clear desk if a resume landed while desk was sticky.
          replaceUnboxUrl((params) => applyUnboxDeskParam(params, false));
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
        // Back to list / close with an open carton → desk so MRU does not re-open.
        enterUnboxDesk();
      }
    },
    [
      enterUnboxDesk,
      isUnboxSurface,
      replaceUnboxOpenReceiving,
      replaceUnboxUrl,
      searchParams,
    ],
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
  // Key already restored (fetched + dispatched) — never re-fetch it.
  const deepLinkedKeyRef = useRef<string | null>(null);
  // Key whose restore fetch is currently in flight. This ref — NOT a per-effect
  // `cancelled` boolean — is the staleness guard: a cold load / reload re-renders
  // (searchParams identity churns) while the fetch is pending, and the old code
  // cancelled the fetch on cleanup then early-returned on the re-run because the
  // key was already marked restored, so the dispatch was dropped and the pane
  // never reopened. Now an incidental re-render with the SAME key is a no-op that
  // lets the fetch finish; only a genuinely different/cleared URL invalidates it.
  const deepLinkInFlightRef = useRef<string | null>(null);
  useEffect(() => {
    const target = searchParams.get('openReceivingId');
    if (!shouldRestoreOpenReceiving(isUnboxSurface, target)) {
      // No restorable carton param on the Unbox surface — drop any restore state
      // so a resolving stale fetch skips its dispatch and a later re-open of the
      // same id re-fetches. Non-Unbox surfaces land here too: `openReceivingId`
      // is Unbox-only, so a value that rode a mode switch onto Incoming/Triage
      // must never `dispatchSelectLine` (which would pop the Incoming details
      // panel on load).
      deepLinkedKeyRef.current = null;
      deepLinkInFlightRef.current = null;
      // Keep restorePending if station-first MRU auto-open is still pending.
      if (!shouldAutoOpenUnboxMru(isUnboxSurface, searchParams)) {
        setRestorePending(false);
      }
      return;
    }
    const lineIdParam = searchParams.get('lineId');
    const deepLinkKey = `${target}:${lineIdParam ?? ''}`;
    if (ignoredOpenKeyRef.current === deepLinkKey) {
      setRestorePending(false);
      return;
    }
    if (pendingOpenKeyRef.current === deepLinkKey) {
      // Local open already wrote this URL — skip re-fetch; clear pending once URL matches.
      deepLinkedKeyRef.current = deepLinkKey;
      pendingOpenKeyRef.current = null;
      setRestorePending(false);
      return;
    }
    if (deepLinkedKeyRef.current === deepLinkKey) {
      setRestorePending(false);
      return; // already restored
    }
    if (deepLinkInFlightRef.current === deepLinkKey) return; // fetch already running — let it finish
    deepLinkInFlightRef.current = deepLinkKey;
    // A fresh restore is resolving — hold the skeleton (covers a client-side nav
    // into a deep link, where the seed above already elapsed).
    setRestorePending(true);
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
        // Dispatch only if this key is still the active URL selection — a close
        // or a switch to another carton clears/overwrites the in-flight ref.
        if (deepLinkInFlightRef.current === deepLinkKey && pick) {
          deepLinkedKeyRef.current = deepLinkKey;
          // Open the overlay directly from this hook's own state. Routing the
          // restore through `dispatchSelectLine` alone is a mount-order race: the
          // sidebar's `receiving-select-line` listener lives in a Suspense-mounted
          // sibling that can commit AFTER this fetch resolves, dropping the
          // one-shot event so refresh lands on the browse feed. `handleOpen`
          // (below) is registered in THIS hook, so setting the workspace here is
          // race-free; `dispatchSelectLine` still fires so the sidebar rail
          // highlights the restored line once it mounts.
          const restored: WorkspaceState = {
            row: pick,
            accordionBootstrap: 'default',
            scanDriven: false,
          };
          workspaceRef.current = restored;
          setWorkspace(restored);
          dispatchSelectLine(pick);
        }
      } catch {
        /* deep-link is best-effort; a network blip just no-ops */
      } finally {
        if (deepLinkInFlightRef.current === deepLinkKey) {
          deepLinkInFlightRef.current = null;
          // Restore resolved (opened, or missed with no carton) — drop the
          // skeleton so a genuine miss falls back to the empty station shell.
          setRestorePending(false);
        }
      }
    })();
  }, [searchParams, isUnboxSurface]);

  // Station-first: bare `/unbox` opens the Unboxed rail's most-recent carton
  // (same list the left dock paints). Wait for the shared rail query — never
  // one-shot miss → Browse-lists empty bench while the rail still has rows.
  useEffect(() => {
    if (!wantMruAutoOpen) {
      mruOpenedReceivingIdRef.current = null;
      return;
    }
    if (workspaceRef.current != null) {
      setRestorePending(false);
      return;
    }

    const rows = unboxRailQuery.data;
    const mru = rows?.[0];
    if (!mru) {
      // Keep pending while the rail is still resolving; settle empty only after
      // a completed fetch with zero rows (scan bar stays armed — no Browse CTA).
      if (unboxRailQuery.isFetched && !unboxRailQuery.isFetching) {
        setRestorePending(false);
      } else {
        setRestorePending(true);
      }
      return;
    }

    const receivingId =
      mru.receiving_id != null && Number.isFinite(Number(mru.receiving_id))
        ? Number(mru.receiving_id)
        : null;
    if (receivingId != null && mruOpenedReceivingIdRef.current === receivingId) {
      setRestorePending(false);
      return;
    }

    setRestorePending(true);
    let cancelled = false;
    void (async () => {
      try {
        let pick: ReceivingLineRow = mru;
        if (receivingId != null) {
          const seeded = queryClient.getQueryData<{
            receiving_lines?: ReceivingLineRow[];
          }>(['receiving-siblings', receivingId]);
          const seededRows = seeded?.receiving_lines;
          if (Array.isArray(seededRows) && seededRows.length > 0) {
            const matched = pickReceivingLineForDeepLink(seededRows, String(mru.id));
            if (matched) pick = matched;
          } else {
            try {
              const res = await fetch(
                `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
                { cache: 'no-store' },
              );
              const data = res.ok ? await res.json().catch(() => null) : null;
              const cartonRows = Array.isArray(data?.receiving_lines)
                ? (data.receiving_lines as ReceivingLineRow[])
                : [];
              const matched = pickReceivingLineForDeepLink(cartonRows, String(mru.id));
              if (matched) pick = matched;
            } catch {
              /* rail row is enough to open */
            }
          }
        }
        if (cancelled || workspaceRef.current != null) return;
        if (receivingId != null) mruOpenedReceivingIdRef.current = receivingId;
        const restored: WorkspaceState = {
          row: pick,
          accordionBootstrap: 'default',
          scanDriven: false,
        };
        workspaceRef.current = restored;
        setWorkspace(restored);
        syncUnboxOpenUrl(pick);
        dispatchSelectLine(pick);
        setTimeout(() => {
          emitReceiving('receiving-focus-scan');
        }, 60);
      } catch {
        /* soft-fail — keep scan bench armed */
      } finally {
        if (!cancelled) setRestorePending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    wantMruAutoOpen,
    unboxRailQuery.data,
    unboxRailQuery.isFetched,
    unboxRailQuery.isFetching,
    queryClient,
    syncUnboxOpenUrl,
  ]);

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
  // line, or the whole carton it belongs to. Station-first: enter desk so MRU
  // auto-open does not surprise-reopen another carton.
  const recoverRightPane = useCallback(
    (isDeleted: (row: ReceivingLineRow) => boolean) => {
      void isDeleted; // kept for call-site symmetry with prior auto-open recovery
      recoveringRef.current = true;
      setWorkspace(null);
      setNav(null);
      if (isUnboxSurface) {
        ignoredOpenKeyRef.current = null;
        pendingOpenKeyRef.current = null;
        enterUnboxDesk();
      } else {
        syncUnboxOpenUrl(null);
      }
      dispatchReceivingWorkspaceClose();
      emitReceiving('receiving-clear-line');
      recoveringRef.current = false;
    },
    [enterUnboxDesk, isUnboxSurface, syncUnboxOpenUrl],
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

  return {
    workspace,
    setWorkspace,
    nav,
    setNav,
    scanInFlight,
    restorePending,
    lookupReceipt,
    clearLookupReceipt,
  };
}
