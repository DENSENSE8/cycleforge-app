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
  DATA_TABLE_PAGE_SIZE,
  isDataTablePageSize,
  readDataTablePageSize,
  writeDataTablePageSize,
  type DataTablePageSize,
} from '@/lib/tables/data-table-pagination';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import type { RowGroup } from '@/lib/group-rows';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';

// ── URL: status chips, exclusions + page ─────────────────────────────────────

const DEFAULT_STATUS_PARAM = 'cardStatus';
const DEFAULT_EXCLUDE_PARAM = 'hide';
const PAGE_PARAM = 'page';

/** Parse a comma-list status parameter into the vocabulary's stable order. */
export function parseStatusParam<K extends string>(raw: string | null | undefined, statusKeys: readonly K[]): ReadonlySet<K> {
  const requested = new Set((raw ?? '').split(',').filter(Boolean));
  return new Set(statusKeys.filter((key) => requested.has(key)));
}
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
  statusParam = DEFAULT_STATUS_PARAM,
  statusSelect = 'many',
}: {
  /** The family's status chips, in URL order; anything else in the param is ignored. */
  statusKeys: readonly K[];
  /** URL params that name the open record — they move within one list, so they are not part of its scope. */
  recordParams: readonly string[];
  /**
   * The param the chips write — default `cardStatus`. A family whose page
   * already owns a state param (History: `dstate`) names it, so one cut
   * lives in ONE param (comma-separated), never two.
   */
  statusParam?: string;
  /**
   * `many` (default): chips OR together (a comma list). `one`: a chip names
   * the list's whole scope (the server narrows by it, Exceptions' `?kind=`),
   * so pressing one replaces the lit one.
   */
  statusSelect?: 'many' | 'one';
}): TriageUrlState<K> {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusRaw = searchParams.get(statusParam) ?? '';
  const statusFilter = useMemo<ReadonlySet<K>>(
    () => parseStatusParam(statusRaw, statusKeys),
    [statusRaw, statusKeys],
  );
  const excludedFilter = useMemo<ReadonlySet<K>>(
    () => parseStatusParam(searchParams.get(DEFAULT_EXCLUDE_PARAM), statusKeys),
    [searchParams, statusKeys],
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
        if (list.length) next.set(statusParam, list.join(','));
        else next.delete(statusParam);
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
    [pathname, searchParams, statusKeys, statusParam],
  );

  const toggleStatus = useCallback(
    (key: K) => {
      const next = new Set<K>(statusSelect === 'one' ? [] : statusFilter);
      if (statusFilter.has(key)) next.delete(key);
      else next.add(key);
      write({ status: next });
    },
    [statusFilter, statusSelect, write],
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

  return useMemo(
    () => ({ statusFilter, excludedFilter, toggleStatus, resetStatus, pageIndex, setPageIndex, scopeKey }),
    [statusFilter, excludedFilter, toggleStatus, resetStatus, pageIndex, setPageIndex, scopeKey],
  );
}

export interface TriageUrlState<K extends string> {
  statusFilter: ReadonlySet<K>;
  excludedFilter: ReadonlySet<K>;
  toggleStatus: (key: K) => void;
  resetStatus: () => void;
  pageIndex: number;
  setPageIndex: (index: number) => void;
  /** The URL minus page + the open record — the scope the rows answer to. */
  scopeKey: string;
}

// ── The face's cut: status chips + held-new records → the host's feed ───────

/**
 * What the triage face hides from the host's rows: groups outside the status
 * chips, and new groups held behind the "N new" pill. The HOST calls this
 * before its data hook and applies `filterBands` where it arranges its bands
 * (before the record cursor), so J / K walk only what the screen shows. The
 * face ({@link TriageCardList}) reads the same handle for pages, Esc-reset and
 * the hold.
 */
export interface TriageCut<K extends string> {
  url: TriageUrlState<K>;
  heldKeys: ReadonlySet<string>;
  setHeldKeys: (keys: ReadonlySet<string>) => void;
  /** Drops held groups and groups with no row in the status filter; drops bands left empty. */
  filterBands: <Row>(
    bands: readonly (readonly [string, readonly RowGroup<Row>[]])[],
    groupKey: (group: RowGroup<Row>) => string,
    rowStatusKeys: (row: Row) => readonly K[],
  ) => [string, RowGroup<Row>[]][];
}
export function filterTriageBands<Row, K extends string>(
  bands: readonly (readonly [string, readonly RowGroup<Row>[]])[],
  groupKey: (group: RowGroup<Row>) => string,
  rowStatusKeys: (row: Row) => readonly K[],
  statusFilter: ReadonlySet<K>,
  excludedFilter: ReadonlySet<K>,
  heldKeys: ReadonlySet<string> = new Set(),
): [string, RowGroup<Row>[]][] {
  return (
    bands.map(([band, groups]) => [
      band,
      groups
        .filter((group) => !heldKeys.has(groupKey(group)))
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) => {
            const keys = rowStatusKeys(row);
            return (
              !keys.some((key) => excludedFilter.has(key)) &&
              (statusFilter.size === 0 || keys.some((key) => statusFilter.has(key)))
            );
          }),
        }))
        .filter((group) => group.rows.length > 0),
    ]) as [string, RowGroup<Row>[]][]
  ).filter(([, groups]) => groups.length > 0);
}

export function useTriageCut<K extends string>(opts: {
  statusKeys: readonly K[];
  recordParams: readonly string[];
  statusParam?: string;
  statusSelect?: 'many' | 'one';
}): TriageCut<K> {
  const url: TriageUrlState<K> = useTriageUrlState(opts);
  const { statusFilter, excludedFilter } = url;
  const [heldKeys, setHeldKeys] = useState<ReadonlySet<string>>(() => new Set());
  const filterBands = useCallback(
    <Row,>(
      bands: readonly (readonly [string, readonly RowGroup<Row>[]])[],
      groupKey: (group: RowGroup<Row>) => string,
      rowStatusKeys: (row: Row) => readonly K[],
    ): [string, RowGroup<Row>[]][] => filterTriageBands(bands, groupKey, rowStatusKeys, statusFilter, excludedFilter, heldKeys),
    [statusFilter, excludedFilter, heldKeys],
  );
  return useMemo(() => ({ url, heldKeys, setHeldKeys, filterBands }), [url, heldKeys, filterBands]);
}

// ── Per-person display prefs ─────────────────────────────────────────────────

/** `scroll` = every loaded card on one page, the next chunk loading as you near the end. */
export type TriagePageMode = DataTablePageSize | 'scroll';

/** Every mounted `useTriagePageMode` — a change in one (the face's menu) re-reads in all (a host that fetches by it). */
const pageModeReaders = new Set<() => void>();

/**
 * Page size (shared with the data tables) or infinite scroll, remembered in
 * this browser under `storageKey`. `resolved` turns true once the remembered
 * choice is read — until then the mode is the SSR default, and a page clamp
 * must not act on it (at 100 / page a reload's `?page=2` looks past the end
 * and was stripped). A host that loads by the page size reads the same mode
 * as its face: every instance follows a change made in any of them.
 */
export function useTriagePageMode(storageKey: string): {
  mode: TriagePageMode;
  setMode: (mode: TriagePageMode) => void;
  resolved: boolean;
} {
  const [mode, setModeState] = useState<TriagePageMode>(DATA_TABLE_PAGE_SIZE);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    const read = () => setModeState(window.localStorage.getItem(storageKey) === '1' ? 'scroll' : readDataTablePageSize());
    read();
    setResolved(true);
    pageModeReaders.add(read);
    return () => {
      pageModeReaders.delete(read);
    };
  }, [storageKey]);
  const setMode = useCallback(
    (next: TriagePageMode) => {
      if (next === 'scroll') window.localStorage.setItem(storageKey, '1');
      else {
        window.localStorage.removeItem(storageKey);
        if (isDataTablePageSize(next)) writeDataTablePageSize(next);
      }
      for (const read of pageModeReaders) read();
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
  /**
   * Read at render: a card key that has just arrived live (not a first paint,
   * not a new question, not a Load more) and lands in view — it swipes in
   * (`SwipeListItem enter="swipe"`). The effect above marks it seen after this
   * commit, so only its mounting render answers true.
   */
  const isArrival = (key: string): boolean =>
    seen.current != null &&
    lastReset.current === resetKey &&
    !trustNext.current &&
    !seen.current.has(key) &&
    (scrollRef.current?.scrollTop ?? 0) <= 40;

  return { held, release, trustNextBatch, isArrival };
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

const INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="menuitem"], [role="option"], [role="tab"]';

/** The card a key acts on: the one holding focus, else the one under the pointer (inside `root`). */
function cardUnderCursor(target: EventTarget | null, root: HTMLElement | null): string | null {
  const focused = target instanceof Element ? target.closest(`[${DESK_RECORD_KEY_ATTR}]`) : null;
  if (focused) return focused.getAttribute(DESK_RECORD_KEY_ATTR);
  const hovered = root?.querySelectorAll(`[${DESK_RECORD_KEY_ATTR}]:hover`);
  return hovered && hovered.length > 0 ? hovered[hovered.length - 1]!.getAttribute(DESK_RECORD_KEY_ATTR) : null;
}

/**
 * The card keys (Law 5 + the quick look), acting on the card under the
 * cursor — the focused card, else the card under the pointer:
 * - **X** checks it (else the open record's card); Shift+X extends a range
 *   like a shift-click on the checkbox.
 * - **Space** unfolds / folds its quick look. A focused card handles its own
 *   Space; this covers the pointer. A focused button elsewhere keeps Space.
 * - **Enter** opens it — only with nothing focused (a focused control keeps
 *   its own Enter; a focused card's Enter is its open button's).
 *
 * Never while typing, with an overlay up, with Ctrl / ⌘ / Alt held, or after
 * another surface took the key — the selection bar's verb letters bind in
 * capture, so a verb on X would win.
 */
export function useTriageCardKeys({
  enabled,
  rootRef,
  openKey,
  onCheck,
  onPeek,
  onOpen,
}: {
  enabled: boolean;
  /** The list's scroll box — the pointer's card is looked up inside it. */
  rootRef: RefObject<HTMLElement | null>;
  /** The open record's `data-desk-record-key`, or null. */
  openKey: string | null;
  onCheck: (recordKey: string, event: { shiftKey: boolean }) => void;
  onPeek: (recordKey: string) => void;
  onOpen: (recordKey: string) => void;
}) {
  const latest = useRef({ openKey, onCheck, onPeek, onOpen });
  latest.current = { openKey, onCheck, onPeek, onOpen };
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const root = rootRef.current;
      const onControl = event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR) != null;
      if (event.key.toLowerCase() === 'x') {
        const key = cardUnderCursor(event.target, root) || latest.current.openKey;
        if (!key) return;
        event.preventDefault();
        latest.current.onCheck(key, { shiftKey: event.shiftKey });
        return;
      }
      if (event.key === ' ') {
        if (onControl) return;
        const key = cardUnderCursor(event.target, root);
        if (!key) return;
        event.preventDefault();
        latest.current.onPeek(key);
        return;
      }
      if (event.key === 'Enter') {
        if (event.target !== document.body) return;
        const key = cardUnderCursor(null, root);
        if (!key) return;
        event.preventDefault();
        latest.current.onOpen(key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, rootRef]);
}
