'use client';

/**
 * Fulfillment › Fulfilled's BOARD (`/fulfilled`, the default layout; operator
 * 2026-10-05), built in the Live feed's image: a full-screen desk board on the
 * canvas, edge to edge and top to bottom. Two levels of disclosure before a
 * record:
 *   1. the headline — Act now (and how many are over), Late · Stalled · No
 *      movement when they say something, Check-ins due, Delivered — with the
 *      answer's freshness; the host's tools then full screen at the right;
 *   2. the columns — one per bucket (`FULFILLED_BUCKETS`) under Act now ·
 *      Watch · Done (`FULFILLED_SECTIONS`), in ONE sideways strip of fixed
 *      lanes: no snap, no scrollbar, the wheel moves ACROSS columns everywhere
 *      on the board, and a LIGHT fade (`COLUMN_BOARD_EDGE_FADE_CLASS`) only on
 *      a side with more.
 * A card opens the order's package beside the board (the host's
 * `DeskRecordPlane`, split), so the board stays in view.
 *
 * Keys (outside text fields): J / K (or ↓ / ↑ on a focused card) walk the
 * focused card's column — or, with a package open, the open card's — opening
 * as they go when a package is open. Esc is the host's.
 *
 * The board reads order grain and every bucket, so it ignores the sheet's
 * status chip. Filters, Sort and Find stay the left sidebar's — so do its
 * display rows (`readFulfilledBoardDisplay`): Done columns and Untracked
 * hidden, compact cards, cards grouped by carrier. The headline adds one
 * quiet warning when a carrier's sync is failing (`syncHealth`).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { RefreshCw } from '@/components/Icons';
import { useJourneyNow } from '@/components/outbound/fulfilled/JourneyClockCell';
import type { FulfilledList } from '@/components/outbound/fulfilled/useFulfilledList';
import { COLUMN_BOARD_EDGE_FADE_CLASS } from '@/design-system/components/column-board/ColumnBoard';
import { ListFocusToggle } from '@/design-system/components/ListFocusToggle';
import { Button } from '@/design-system/primitives/Button';
import { Spinner } from '@/design-system/primitives/Spinner';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import { FULFILLED_SECTIONS, type FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import { readFulfilledBoardDisplay } from '@/lib/outbound/fulfilled-params';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { cn } from '@/utils/_cn';
import { fulfilledBoardColumns, fulfilledHeadline, fulfilledSyncWarning, visibleBoardColumns } from './fulfilled-board-model';
import { FreshnessDot, FulfilledHeadline } from './FulfilledHeadline';
import { JourneyColumn, JourneyRail } from './JourneyColumn';

/** A card's open target and the column it sits in — the J / K walk's marks. */
const OPEN_SELECTOR = '[data-journey-open]';
const COLUMN_SELECTOR = '[data-journey-column]';

export function FulfilledBoard({
  list,
  openShipmentId,
  onOpen,
  onShowInSheet,
  lead,
  tools,
}: {
  list: FulfilledList;
  /** The package open in the record plane — its card wears the open outline. */
  openShipmentId: number | null;
  /** Open the order's package beside the board. */
  onOpen: (entry: BulkEntry) => void;
  /** The sheet, narrowed to one bucket (`?layout=sheet&status=`). */
  onShowInSheet: (bucket: FulfilledBucketId) => void;
  /** First on the headline row — a Back for a page entered from another page. */
  lead?: ReactNode;
  /** The host's layout toggles, right-aligned just left of full screen. */
  tools?: ReactNode;
}) {
  const now = useJourneyNow();
  const columns = useMemo(() => fulfilledBoardColumns(list.entries, list.buckets, now), [list.entries, list.buckets, now]);
  const figures = useMemo(() => fulfilledHeadline(columns, list.entries), [columns, list.entries]);
  // The sidebar's display rows (Done columns · Untracked · Cards · Group by) — the board's own, never sent to the API.
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const display = useMemo(() => readFulfilledBoardDisplay(new URLSearchParams(search)), [search]);
  const painted = useMemo(() => visibleBoardColumns(columns, display), [columns, display]);
  const syncWarning = fulfilledSyncWarning(list.syncHealth);
  // An empty bucket is a rail until the staffer unfolds it.
  const [unfolded, setUnfolded] = useState<ReadonlySet<FulfilledBucketId>>(() => new Set());
  const unfold = useCallback((bucket: FulfilledBucketId) => setUnfolded((current) => new Set(current).add(bucket)), []);
  const boardRef = useRef<HTMLDivElement>(null);
  // Before the first answer arrives (an empty window still answers, with every bucket at 0).
  const firstLoad = list.updatedAt === 0;

  // Keys: J / K walk a column (↓ / ↑ too, while a card has focus).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const board = boardRef.current;
      if (!board) return;
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && board.contains(active) ? active.closest<HTMLElement>(OPEN_SELECTOR) : null;
      const letter = event.key === 'j' || event.key === 'k';
      const arrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
      if (!letter && !(arrow && focused)) return;
      const delta = event.key === 'j' || event.key === 'ArrowDown' ? 1 : -1;
      const from = focused ?? (openShipmentId != null ? board.querySelector<HTMLElement>(`${OPEN_SELECTOR}[aria-current="true"]`) : null);
      const cards = from
        ? [...(from.closest(COLUMN_SELECTOR)?.querySelectorAll<HTMLElement>(OPEN_SELECTOR) ?? [])]
        : [...board.querySelectorAll<HTMLElement>(OPEN_SELECTOR)];
      const next = from ? cards[cards.indexOf(from) + delta] : cards[0];
      event.preventDefault();
      if (!next) return;
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (openShipmentId != null) next.click();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openShipmentId]);

  return (
    <div ref={boardRef} data-fulfilled-board className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-surface-canvas">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-3 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-end gap-3">
          {lead}
          {firstLoad ? null : <FulfilledHeadline figures={figures} syncWarning={syncWarning} />}
        </div>
        <div data-fulfilled-board-tools className="flex shrink-0 items-center gap-2">
          <FreshnessDot updatedAt={list.updatedAt} now={now} fetching={list.loading} />
          {tools}
          {/* Full screen is the top-right-most control. */}
          <ListFocusToggle />
        </div>
      </div>
      {list.error && !firstLoad ? (
        <div className="mx-4 mb-3 flex shrink-0 items-center gap-2 text-sm text-text-danger" role="alert">
          <span className="min-w-0 flex-1 truncate">{list.error}</span>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={list.refetch}>
            Retry
          </Button>
        </div>
      ) : null}
      {firstLoad ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-text-muted" aria-busy={list.error ? undefined : true}>
          {list.error ? (
            <>
              <span className="text-text-danger">Couldn&apos;t load the fulfilled orders.</span>
              <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={list.refetch}>
                Retry
              </Button>
            </>
          ) : (
            <>
              <Spinner size="sm" /> Loading fulfilled orders…
            </>
          )}
        </div>
      ) : (
        <BoardStrip>
          {FULFILLED_SECTIONS.filter((section) => painted.some((column) => column.section === section.id)).map((section) => (
            <section key={section.id} aria-label={section.label} data-section={section.id} className="flex min-h-0 shrink-0 flex-col">
              <p className="flex h-6 shrink-0 items-center text-role-eyebrow text-text-muted">{section.label}</p>
              <div className="flex min-h-0 flex-1 gap-3">
                {painted
                  .filter((column) => column.section === section.id)
                  .map((column) =>
                    column.count === 0 && column.cards.length === 0 && !unfolded.has(column.id) ? (
                      <JourneyRail key={column.id} column={column} onExpand={unfold} />
                    ) : (
                      <JourneyColumn
                        key={column.id}
                        column={column}
                        openShipmentId={openShipmentId}
                        onOpen={onOpen}
                        onShowInSheet={onShowInSheet}
                        now={now}
                        compact={display.compact}
                        groupByCarrier={display.groupByCarrier}
                      />
                    ),
                  )}
              </div>
            </section>
          ))}
        </BoardStrip>
      )}
    </div>
  );
}

/**
 * The one sideways strip: fixed lanes, no snap, no scrollbar. The wheel moves
 * ACROSS columns wherever the pointer is — cards included (operator
 * 2026-10-06: a column must never capture the wheel); a trackpad's sideways
 * swipe and Shift + wheel stay the platform's own. A column's own list moves
 * only with Alt + wheel, its keys (J / K) or a drag. No snap, so one long
 * wheel travels through as many columns as it carries. A light fade marks
 * only a side with hidden columns.
 */
function BoardStrip({ children }: { children: ReactNode }) {
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    if (!strip) return;
    const read = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      const start = strip.scrollLeft > 1;
      const end = strip.scrollLeft < max - 1;
      setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    // The strip's own box and each section in it: a column unfolded moves the end edge.
    const resize = new ResizeObserver(read);
    const watch = () => {
      resize.disconnect();
      resize.observe(strip);
      for (const child of strip.children) resize.observe(child);
      read();
    };
    watch();
    const mutations = new MutationObserver(watch);
    mutations.observe(strip, { childList: true });
    const onWheel = (event: WheelEvent) => {
      // Pinch-zoom, Shift + wheel and sideways swipes are native; Alt + wheel scrolls the column under the pointer.
      if (event.ctrlKey || event.shiftKey || event.altKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      // Line-mode wheels (Firefox) report lines, not pixels.
      strip.scrollLeft += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 40 : event.deltaY;
    };
    strip.addEventListener('scroll', read, { passive: true });
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      resize.disconnect();
      mutations.disconnect();
      strip.removeEventListener('scroll', read);
      strip.removeEventListener('wheel', onWheel);
    };
  }, [strip]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div
        ref={setStrip}
        data-testid="fulfilled-board"
        aria-label="Fulfilled orders by journey stage"
        className="flex min-h-0 min-w-0 flex-1 gap-6 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <span
        aria-hidden
        data-testid="fulfilled-board-edge-start"
        data-visible={edges.start ? '' : undefined}
        className={cn(COLUMN_BOARD_EDGE_FADE_CLASS, 'left-0 bg-gradient-to-r', edges.start ? 'opacity-100' : 'opacity-0')}
      />
      <span
        aria-hidden
        data-testid="fulfilled-board-edge-end"
        data-visible={edges.end ? '' : undefined}
        className={cn(COLUMN_BOARD_EDGE_FADE_CLASS, 'right-0 bg-gradient-to-l', edges.end ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}
