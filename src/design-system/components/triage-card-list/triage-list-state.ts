'use client';

/**
 * TriageCardList state that outlives one render — URL filters and page,
 * per-person display prefs, the kept scroll place, held-back new records and
 * the list's hotkeys (owner 2026-09-27, BRIEF §13). Family-agnostic: a family
 * passes its status-chip keys, its record URL params and its storage keys.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import {
  SLOT_TABLE_PAGE_SIZE,
  isSlotTablePageSize,
  readSlotTablePageSize,
  writeSlotTablePageSize,
  type SlotTablePageSize,
} from '@/lib/tables/slot-table-page';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';

// ── URL: status chips + page ─────────────────────────────────────────────────

const STATUS_PARAM = 'cardStatus';
const PAGE_PARAM = 'page';

/**
 * Status chips and the page live in the URL (`?cardStatus=outOfStock,late&page=2`),
 * so a reload or a shared link lands on the same cut. Every route that mounts
 * a triage list declares both params (the param hygiene drops undeclared keys).
 *
 * Written through the History API, not `router.replace`: Next syncs
 * `useSearchParams` from it with no server round-trip. A soft `router.replace`
 * here waits on an RSC fetch before the URL moves, so quick chip / page
 * presses superseded each other and the URL lagged one press behind.
 */
export function useTriageUrlState<K extends string>({
  statusKeys,
  recordParams,
}: {
  /** The family's status chips, in URL order; anything else in the param is ignored. */
  statusKeys: readonly K[];
  /** URL params that name the open record — they move within one list, so they are not part of its scope. */
  recordParams: readonly string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusRaw = searchParams.get(STATUS_PARAM) ?? '';
  const statusFilter = useMemo<ReadonlySet<K>>(
    () => new Set(statusRaw.split(',').filter((k): k is K => (statusKeys as readonly string[]).includes(k))),
    [statusRaw, statusKeys],
  );
  const pageRaw = Number(searchParams.get(PAGE_PARAM));
  const pageIndex = Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) - 1 : 0;

  const write = useCallback(
    (patch: { status?: ReadonlySet<K>; pageIndex?: number }) => {
      // Seed from the live address bar — two presses inside one render must
      // not write from the same stale params.
      const current = readLiveSearchParams(searchParams.toString());
      const next = new URLSearchParams(current);
      if (patch.status) {
        const list = statusKeys.filter((k) => patch.status!.has(k));
        if (list.length) next.set(STATUS_PARAM, list.join(','));
        else next.delete(STATUS_PARAM);
        // A new cut starts on its first page.
        next.delete(PAGE_PARAM);
      }
      if (patch.pageIndex != null) {
        if (patch.pageIndex > 0) next.set(PAGE_PARAM, String(patch.pageIndex + 1));
        else next.delete(PAGE_PARAM);
      }
      const qs = next.toString();
      if (qs === current.toString()) return;
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams, statusKeys],
  );

  const toggleStatus = useCallback(
    (key: K) => {
      const next = new Set(statusFilter);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      write({ status: next });
    },
    [statusFilter, write],
  );
  const resetStatus = useCallback(() => write({ status: new Set() }), [write]);
  const setPageIndex = useCallback((index: number) => write({ pageIndex: Math.max(0, index) }), [write]);
  // The URL minus what only moves WITHIN one list (page, the open record):
  // the scope the rows answer to.
  const scopeKey = useMemo(() => {
    const scope = new URLSearchParams(searchParams.toString());
    for (const key of [PAGE_PARAM, ...recordParams]) scope.delete(key);
    return scope.toString();
  }, [searchParams, recordParams]);

  return { statusFilter, toggleStatus, resetStatus, pageIndex, setPageIndex, scopeKey };
}

// ── Per-person display prefs ─────────────────────────────────────────────────

/** `scroll` = every loaded card on one page, the next chunk loading as you near the end. */
export type TriagePageMode = SlotTablePageSize | 'scroll';

/**
 * Page size (shared with the slot tables) or infinite scroll, remembered in
 * this browser under `storageKey`. `resolved` turns true once the remembered
 * choice is read — until then the mode is the SSR default, and a page clamp
 * must not act on it (at 100 / page a reload's `?page=2` looks past the end
 * and was stripped).
 */
export function useTriagePageMode(storageKey: string): {
  mode: TriagePageMode;
  setMode: (mode: TriagePageMode) => void;
  resolved: boolean;
} {
  const [mode, setModeState] = useState<TriagePageMode>(SLOT_TABLE_PAGE_SIZE);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    setModeState(window.localStorage.getItem(storageKey) === '1' ? 'scroll' : readSlotTablePageSize());
    setResolved(true);
  }, [storageKey]);
  const setMode = useCallback(
    (next: TriagePageMode) => {
      if (next === 'scroll') window.localStorage.setItem(storageKey, '1');
      else {
        window.localStorage.removeItem(storageKey);
        if (isSlotTablePageSize(next)) writeSlotTablePageSize(next);
      }
      setModeState(next);
    },
    [storageKey],
  );
  return { mode, setMode, resolved };
}

// ── Keep the place ───────────────────────────────────────────────────────────

/**
 * The list's scroll offset survives closing a record, switching views and a
 * reload (sessionStorage `${storagePrefix}:${pathname}`). Restored once, after
 * the first cards paint.
 */
export function useKeptScroll(scrollRef: RefObject<HTMLDivElement | null>, ready: boolean, storagePrefix: string) {
  const pathname = usePathname();
  const key = `${storagePrefix}:${pathname}`;
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const saved = Number(window.sessionStorage.getItem(key));
    if (Number.isFinite(saved) && saved > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: saved }));
    }
  }, [ready, key, scrollRef]);
  const frame = useRef<number | null>(null);
  return useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const top = scrollRef.current?.scrollTop ?? 0;
      window.sessionStorage.setItem(key, String(Math.round(top)));
    });
  }, [key, scrollRef]);
}

// ── New records arrive quietly ───────────────────────────────────────────────

/**
 * Records that land while the list is scrolled away from the top are HELD — a
 * "N new …" pill offers them instead of shoving the cards down. At the top
 * they simply slide in. The first paint, a new search and a "Load more" are
 * the operator's own asks: whatever they bring in is never held.
 */
export function useHeldNewRecords({
  groupKeys,
  scrollRef,
  resetKey,
}: {
  /** Every card key currently in the feed (before the hold is applied). */
  groupKeys: readonly string[];
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Changes when the operator changes the question (search, filters) — everything then counts as seen. */
  resetKey: string;
}) {
  const seen = useRef<Set<string> | null>(null);
  const trustNext = useRef(false);
  const lastReset = useRef(resetKey);
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (groupKeys.length === 0) return;
    if (seen.current == null || lastReset.current !== resetKey || trustNext.current) {
      seen.current = new Set(groupKeys);
      lastReset.current = resetKey;
      trustNext.current = false;
      setHeld((prev) => (prev.size ? new Set() : prev));
      return;
    }
    const fresh = groupKeys.filter((k) => !seen.current!.has(k));
    if (fresh.length === 0) return;
    const awayFromTop = (scrollRef.current?.scrollTop ?? 0) > 40;
    for (const k of fresh) seen.current.add(k);
    if (awayFromTop) setHeld((prev) => new Set([...prev, ...fresh]));
  }, [groupKeys, resetKey, scrollRef]);

  const release = useCallback(() => {
    setHeld(new Set());
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [scrollRef]);
  /** Call before a "Load more": the rows it brings are the operator's own ask. */
  const trustNextBatch = useCallback(() => {
    trustNext.current = true;
  }, []);

  return { held, release, trustNextBatch };
}

// ── Hotkeys ──────────────────────────────────────────────────────────────────

/**
 * `[` / `]` previous / next page, Home / End first / last loaded page. Never
 * while typing, with an overlay up, or with a modifier held.
 */
export function useTriagePageKeys({
  enabled,
  onPrev,
  onNext,
  onFirst,
  onLast,
}: {
  enabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onFirst: () => void;
  onLast: () => void;
}) {
  const handlers = useRef({ onPrev, onNext, onFirst, onLast });
  handlers.current = { onPrev, onNext, onFirst, onLast };
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const run =
        event.key === '['
          ? handlers.current.onPrev
          : event.key === ']'
            ? handlers.current.onNext
            : event.key === 'Home'
              ? handlers.current.onFirst
              : event.key === 'End'
                ? handlers.current.onLast
                : null;
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
