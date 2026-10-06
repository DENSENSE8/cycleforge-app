'use client';

/**
 * The Live feed — every outbound carrier package still in the building, by
 * stage (To pick → Picked → Packed), plus what the dock scanned out today.
 * It is live and always today. Three levels of disclosure:
 *   1. the headline: in the building, late, stalled, scanned out — with the
 *      dock's pace and today's carrier pickup countdowns;
 *   2. the board: one column per stage (the phone: one column under stage tabs);
 *   3. a package: open a card for its journey, box, tags and comments — beside
 *      the board on a desk, a full-screen sheet on a phone.
 *
 * The URL is the state the sidebar shares: `open` (the open package — seeded
 * into React state, since a `replaceState` write by this board must re-render
 * it at once), `q` (find: the sidebar's NavFind on a desk, the phone's own
 * field, or a gun scan anywhere on the board), and the sidebar's `carrier` /
 * `channel` facets and `staff` filter (the phone's "Mine").
 *
 * Keys (outside text fields): Esc closes the package, else clears the
 * selection; J / K walk the open package's column; 1–4 jump to a stage; `/`
 * focuses find.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { ListChecks, User } from '@/components/Icons';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { useColumnBoardPager } from '@/design-system/components/column-board/ColumnBoardPhone';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { SearchField } from '@/design-system/primitives/SearchField';
import { Spinner } from '@/design-system/primitives/Spinner';
import { useIsMobile } from '@/hooks/_ui';
import { requestDeskSearchFocus } from '@/lib/outbound/desk-search-store';
import { LIVE_FEED_QUERY_ROOT, liveFeedBoardQuery, liveFeedPackagesQuery } from '@/lib/live-feed/query';
import { LIVE_FEED_PARAMS, liveFeedSortParam, readLiveFeedFilters, readLiveFeedOpen } from '@/lib/live-feed/route';
import {
  isPackageStage,
  PACKAGE_STAGES,
  resolvePackageSorts,
  type PackageSort,
  type PackageStage,
} from '@/lib/live-feed/stages';
import type { PackageCard, PackageColumn } from '@/lib/live-feed/types';
import { Headline, LiveDot } from './BoardHeadline';
import { LiveFeedBulkBar } from './BulkBar';
import { FindResults } from './FindResults';
import { useLiveFeedRealtime, useNow } from './live-feed-hooks';
import { PaceStrip } from './PaceStrip';
import { PackageDetail } from './PackageDetail';
import { PickupStrip } from './PickupStrip';
import { StageColumn } from './StageColumn';
import { StageTabs } from './StageTabs';

const EMPTY_PARAMS = new URLSearchParams();
/** The open package rail on a desk: a 24rem panel plus the 1rem gap it pushes in — the slot AND the panel width. */
const RAIL_WIDTH = '25rem';
/** After the rail's width tween (`motionRole.push.rail`, 0.24 s) and the sheet's spring settle. */
const OPEN_URL_SYNC_MS = 400;

export function LiveFeedBoard({ surface, viewerStaffId }: { surface: 'desk' | 'phone'; viewerStaffId: number | null }) {
  const searchParams = useSearchParams() ?? EMPTY_PARAMS;
  const replace = useReplaceSearchParams();
  const queryClient = useQueryClient();
  const filterKey = [LIVE_FEED_PARAMS.carrier, LIVE_FEED_PARAMS.channel, LIVE_FEED_PARAMS.staff, LIVE_FEED_PARAMS.sort]
    .map((name) => searchParams.get(name) ?? '')
    .join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `filterKey` is the filters' identity.
  const filters = useMemo(() => readLiveFeedFilters(searchParams), [filterKey]);
  const q = searchParams.get(LIVE_FEED_PARAMS.q)?.trim() ?? '';
  const [openId, setOpenId] = useState(() => readLiveFeedOpen(searchParams));
  useLiveFeedRealtime();
  const now = useNow();
  const narrow = useIsMobile();
  const phone = surface === 'phone' || narrow;

  const query = useQuery(liveFeedBoardQuery(filters));
  const board = query.data;
  const columns = useMemo(() => board?.columns ?? [], [board]);

  // ── The open package: the board's fresh copy when it lists it, else the card as opened, else (a deep link past page 1) fetched.
  const [opened, setOpened] = useState<PackageCard | null>(null);
  const located = useMemo(() => {
    if (openId == null) return null;
    for (const column of columns) {
      const index = column.items.findIndex((item) => item.orderRowId === openId);
      if (index >= 0) return { card: column.items[index]!, column, index };
    }
    return null;
  }, [columns, openId]);
  const missing = openId != null && !located && opened?.orderRowId !== openId;
  const linked = useQuery({ ...liveFeedPackagesQuery(missing && openId != null ? [openId] : []) });
  const openCard =
    openId == null ? null : (located?.card ?? (opened?.orderRowId === openId ? opened : (linked.data?.packages.find((card) => card.orderRowId === openId) ?? null)));

  const writeParam = useCallback(
    (name: string, value: string | null) =>
      replace((params) => {
        if (value == null || value === '') params.delete(name);
        else params.set(name, value);
      }),
    [replace],
  );
  // ── Each column's order lives in the URL (`sort`, non-defaults only); the board and every lane page read it.
  const sorts = useMemo(() => resolvePackageSorts(filters.sorts), [filters.sorts]);
  const setSort = useCallback(
    (stage: PackageStage, sort: PackageSort) => writeParam(LIVE_FEED_PARAMS.sort, liveFeedSortParam({ ...filters.sorts, [stage]: sort })),
    [filters.sorts, writeParam],
  );
  // The URL sync re-renders every `useSearchParams` reader on the page (sidebar included), which
  // would stall the rail's open/close motion; the state flips now, the URL follows once it settles.
  const openSync = useRef<number | null>(null);
  const latestWriteParam = useRef(writeParam);
  latestWriteParam.current = writeParam;
  useEffect(() => () => {
    if (openSync.current != null) window.clearTimeout(openSync.current);
  }, []);
  const writeOpen = useCallback((nextOpen: number | null) => {
    setOpenId(nextOpen);
    if (openSync.current != null) window.clearTimeout(openSync.current);
    openSync.current = window.setTimeout(() => {
      openSync.current = null;
      // The newest writer: a find or filter written meanwhile must not be rolled back.
      latestWriteParam.current(LIVE_FEED_PARAMS.open, nextOpen == null ? null : String(nextOpen));
    }, OPEN_URL_SYNC_MS);
  }, []);
  const open = useCallback(
    (card: PackageCard) => {
      setOpened(card);
      writeOpen(card.orderRowId);
    },
    [writeOpen],
  );
  const close = useCallback(() => writeOpen(null), [writeOpen]);
  const step = useCallback(
    (delta: -1 | 1) => {
      const next = located?.column.items[located.index + delta];
      if (next) open(next);
    },
    [located, open],
  );

  // ── Bulk selection (the bulk bar's records). A desk shows checks on hover; a phone opts in with Select.
  const [checked, setChecked] = useState<ReadonlyMap<number, PackageCard>>(new Map());
  const [selectMode, setSelectMode] = useState(false);
  const toggleCheck = useCallback((card: PackageCard) => {
    setChecked((was) => {
      const next = new Map(was);
      if (next.has(card.orderRowId)) next.delete(card.orderRowId);
      else next.set(card.orderRowId, card);
      return next;
    });
  }, []);
  const clearChecks = useCallback(() => {
    setChecked(new Map());
    setSelectMode(false);
  }, []);
  const checkedIds = useMemo(() => new Set(checked.keys()), [checked]);
  const checkMode = checked.size > 0 || selectMode ? 'shown' : phone ? 'off' : 'hover';

  // ── Phone: one stage at a time.
  const pager = useColumnBoardPager(PACKAGE_STAGES, phone);
  const activeStage: PackageStage = isPackageStage(pager.activeId) ? pager.activeId : 'to_pick';
  const phoneFindRef = useRef<HTMLInputElement>(null);

  // Keys: Esc, J / K, 1–4, `/`.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const stage = PACKAGE_STAGES[Number(event.key) - 1];
      if (event.key === 'Escape' && openId != null) close();
      else if (event.key === 'Escape' && checked.size > 0) clearChecks();
      else if (openId != null && (event.key === 'j' || event.key === 'ArrowDown')) step(1);
      else if (openId != null && (event.key === 'k' || event.key === 'ArrowUp')) step(-1);
      else if (stage && /^[1-4]$/.test(event.key)) {
        if (phone) pager.show(stage);
        const column = document.querySelector<HTMLElement>(`[data-testid="live-feed-column-${stage}"]`);
        column?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        column?.querySelector<HTMLElement>('[data-package-open]')?.focus({ preventScroll: true });
      } else if (event.key === '/') {
        if (phone) phoneFindRef.current?.focus();
        else requestDeskSearchFocus();
      } else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, checked.size, close, clearChecks, step, phone, pager]);

  // A gun scan anywhere on the board is a find (the global wedge listener lets the page claim it first).
  useEffect(() => {
    const onScan = (event: Event) => {
      const value = (event as CustomEvent<{ value: string }>).detail?.value?.trim();
      if (!value) return;
      event.preventDefault();
      writeParam(LIVE_FEED_PARAMS.q, value);
    };
    window.addEventListener('wedge-scan', onScan);
    return () => window.removeEventListener('wedge-scan', onScan);
  }, [writeParam]);

  // The desk rail pushes the board aside (the house in-flow rail: one symmetric width tween),
  // and a package → package step crossfades inside it. Both collapse under reduced motion.
  const railPush = useMotionRole(motionRole.push.rail);
  const railSwap = useMotionRole(motionRole.swap.focus);
  const detail = openCard ? (
    <PackageDetail
      card={openCard}
      now={now}
      position={located ? { index: located.index, total: located.column.count } : null}
      onStep={step}
      onClose={close}
      onOpen={open}
    />
  ) : null;

  const find = q ? <FindResults q={q} openId={openId} onOpen={open} onClear={() => writeParam(LIVE_FEED_PARAMS.q, null)} /> : null;
  const bulk = (
    <LiveFeedBulkBar
      cards={[...checked.values()]}
      surface={phone ? 'phone' : 'desk'}
      onClear={clearChecks}
      onDone={() => {
        clearChecks();
        void queryClient.invalidateQueries({ queryKey: LIVE_FEED_QUERY_ROOT });
      }}
    />
  );

  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
        {query.isError ? "Couldn't load the live feed — it retries on the next update." : <><Spinner size="sm" /> Loading the floor…</>}
      </div>
    );
  }

  const inBuilding = columns.filter((column) => column.stage !== 'scanned_out').reduce((sum, column) => sum + column.count, 0);
  const columnFor = (column: PackageColumn, className?: string) => (
    <StageColumn
      key={column.stage}
      column={column}
      filters={filters}
      sort={sorts[column.stage]}
      onSort={setSort}
      now={now}
      selectedId={openId}
      checkedIds={checkedIds}
      checkMode={checkMode}
      onOpen={open}
      onToggleCheck={toggleCheck}
      className={className}
    />
  );

  if (phone) {
    const mine = viewerStaffId != null && filters.staffId === viewerStaffId;
    return (
      <div className="relative flex h-full min-h-0 flex-col gap-3 bg-slate-50 px-3 pt-3" data-testid="live-feed-board" data-surface="phone">
        <div className="flex items-center justify-between gap-2">
          <Headline columns={columns} compact />
          <LiveDot updatedAt={query.dataUpdatedAt} now={now} fetching={query.isFetching} compact />
        </div>
        <PickupStrip pickups={board?.pickups ?? []} now={now} />
        <div className="flex items-center gap-2">
          {/* The phone has no sidebar (mobile exemption, sidebar-controls-contract): find and Mine live here. */}
          <SearchField
            value={q}
            onChange={(value) => writeParam(LIVE_FEED_PARAMS.q, value.trim() || null)}
            onClear={() => writeParam(LIVE_FEED_PARAMS.q, null)}
            inputRef={phoneFindRef}
            placeholder="Scan or type tracking, order #, SKU"
            className="min-w-0 flex-1"
          />
          {viewerStaffId != null ? (
            <Button
              variant={mine ? 'ink' : 'secondary'}
              size="sm"
              icon={<User className="size-4" />}
              aria-pressed={mine}
              onClick={() => writeParam(LIVE_FEED_PARAMS.staff, mine ? null : String(viewerStaffId))}
              data-testid="live-feed-mine"
            >
              Mine
            </Button>
          ) : null}
          <IconButton
            icon={<ListChecks className="size-4" />}
            ariaLabel={selectMode ? 'Stop selecting' : 'Select packages'}
            aria-pressed={selectMode || checked.size > 0}
            tone={selectMode || checked.size > 0 ? 'accent' : 'neutral'}
            size="touch"
            radius="pill"
            onClick={() => (selectMode || checked.size > 0 ? clearChecks() : setSelectMode(true))}
            data-testid="live-feed-select"
          />
        </div>
        {find}
        <StageTabs columns={columns} active={activeStage} onPick={pager.show} />
        <div ref={pager.stripRef} className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:none]">
          {columns.map((column) => columnFor(column, 'w-full shrink-0 snap-start'))}
        </div>
        {bulk}
        <AnimatePresence>
          {detail ? (
            <motion.div
              key="sheet"
              className="fixed inset-0 z-modal flex flex-col bg-slate-900/40 pt-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <motion.div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              >
                <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300" />
                {detail}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4 bg-slate-50 p-4" data-testid="live-feed-board" data-surface="desk">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <Headline columns={columns} />
          {board ? <PaceStrip pace={board.pace} inBuilding={inBuilding} now={now} /> : null}
        </div>
        <LiveDot updatedAt={query.dataUpdatedAt} now={now} fetching={query.isFetching} />
      </div>
      <PickupStrip pickups={board?.pickups ?? []} now={now} />
      {find}
      <div className="flex min-h-0 flex-1">
        {/* All four stages always fit: the columns give way (and the cards compact) as the rail pushes in.
            The bulk bar floats over the columns' bottom edge only — never over the open package rail. */}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <div className="grid min-h-0 min-w-0 flex-1 auto-cols-[minmax(0,1fr)] grid-flow-col gap-3">
            {columns.map((column) => columnFor(column))}
          </div>
          {bulk}
        </div>
        <AnimatePresence initial={false}>
          {detail ? (
            <motion.aside
              key="detail"
              aria-label="Package"
              // `relative z-raised`: the columns are stacking contexts (`@container`), so an unpositioned rail
              // would paint UNDER any column it touches. Width carries the gap (pl-4) so the columns reflow
              // in one motion; clip only while moving.
              className="relative z-raised flex shrink-0 justify-end"
              initial={{ width: 0, overflow: 'hidden' }}
              animate={{ width: RAIL_WIDTH, transitionEnd: { overflow: 'visible' } }}
              exit={{ width: 0, overflow: 'hidden' }}
              transition={railPush.transition}
            >
              <motion.div
                className="h-full shrink-0 pl-4"
                // The panel's width is the slot's width — never its content's — so it can never spill left over the columns.
                style={{ width: RAIL_WIDTH }}
                initial={{ ...railPush.presence.initial, x: 32 }}
                animate={{ ...railPush.presence.animate, x: 0 }}
                exit={{ ...railPush.presence.exit, x: 32 }}
                transition={railPush.transition}
              >
                <motion.div
                  key={openCard?.orderRowId}
                  className="h-full min-w-0 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/10"
                  initial={railSwap.presence.initial}
                  animate={railSwap.presence.animate}
                  transition={railSwap.transition}
                >
                  {detail}
                </motion.div>
              </motion.div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
