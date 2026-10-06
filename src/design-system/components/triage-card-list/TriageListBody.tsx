'use client';

/**
 * The scrolling body of a TriageCardList (owner 2026-09-27, BRIEF §13): the
 * held-new pill, the card list with its sticky section headers, the empty
 * and loading states, "Load more" (and Scroll mode's auto-load), the kept
 * scroll place and the bottom shadow. Family-agnostic — cards arrive as
 * already-keyed `<CollapseItem as="li">` / {@link TriageSectionHeader} items.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject, type WheelEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { CARD_LIST_SETTLE_S } from '../record-card/RecordCard';
import { useKeptScroll } from './triage-list-state';

const SPRING = { type: 'spring', stiffness: 480, damping: 36, mass: 0.8 } as const;

const SECTION_TONE_CLASS: Readonly<Record<TriageSectionTone, string>> = {
  danger: 'text-text-danger',
  warning: 'text-text-warning',
  muted: 'text-text-muted',
};

export type TriageSectionTone = 'danger' | 'warning' | 'muted';

/** Card density: a section head that follows a card draws the hairline that card would otherwise end without — at the cards' 20px inset. */
const SECTION_HEAD_RULE =
  "[&>[data-triage-section]:not(:first-child)]:before:pointer-events-none [&>[data-triage-section]:not(:first-child)]:before:absolute [&>[data-triage-section]:not(:first-child)]:before:inset-x-5 [&>[data-triage-section]:not(:first-child)]:before:top-0 [&>[data-triage-section]:not(:first-child)]:before:h-px [&>[data-triage-section]:not(:first-child)]:before:bg-border-hairline [&>[data-triage-section]:not(:first-child)]:before:content-['']";

/**
 * A sticky section header in the card list. No layout tween (owner
 * 2026-09-27: the header text slid sideways and down with the cards): key it
 * by the section's first card, so a re-cut list (filter, page, sort) mounts a
 * fresh header that waits for the cards to land, then rises from below.
 * The list's order is the sidebar's Sort; a section carries none of its own.
 */
export function TriageSectionHeader({
  label,
  count,
  tone,
  testId,
}: {
  label: string;
  count: number | undefined;
  tone: TriageSectionTone;
  testId: string;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: CARD_LIST_SETTLE_S }}
      data-testid={testId}
      data-triage-section=""
      className="sticky left-0 top-0 z-20 -mx-1 flex items-center gap-2 bg-surface-card/90 pb-1.5 pl-5 pr-4 pt-3 backdrop-blur-sm"
    >
      <span className={cn('text-xs font-semibold', SECTION_TONE_CLASS[tone])}>{label}</span>
      <span className="rounded-full bg-surface-sunken px-1.5 text-[11px] font-semibold tabular-nums text-text-muted">{count}</span>
    </motion.li>
  );
}

/** Nothing left to triage: a check that draws itself, then the family's words. */
export function TriageAllClear({ title, detail }: { title: string; detail: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING}
      className="flex min-h-72 flex-col items-center justify-center gap-2 text-center"
    >
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.1 }}
        className="flex size-12 items-center justify-center rounded-full bg-surface-success text-text-success"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.3 }}
          />
        </svg>
      </motion.span>
      <p className="text-base font-semibold text-text-default">{title}</p>
      <p className="text-sm text-text-muted">{detail}</p>
    </motion.div>
  );
}

/** Loading placeholders in the RecordCard's own anatomy: check + icon, line 1, photo + two lines. */
function CardSkeletons() {
  return (
    <ul aria-hidden className="flex flex-col">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex gap-3 rounded-2xl px-4 py-3">
          <span className="w-7 shrink-0 space-y-3 pt-0.5">
            <span className="block size-[18px] animate-pulse rounded-[5px] bg-surface-sunken" />
            <span className="block size-4 animate-pulse rounded-md bg-surface-sunken" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-2.5">
            <span className="flex justify-between">
              <span className="h-3.5 w-56 animate-pulse rounded-md bg-surface-sunken" />
              <span className="h-3.5 w-20 animate-pulse rounded-md bg-surface-sunken" />
            </span>
            <span className="flex gap-3">
              <span className="size-12 shrink-0 animate-pulse rounded-xl bg-surface-sunken" />
              <span className="flex flex-1 flex-col gap-2 pt-1">
                <span className="h-4 w-3/4 animate-pulse rounded-md bg-surface-sunken" style={{ animationDelay: `${i * 60}ms` }} />
                <span className="h-3 w-1/2 animate-pulse rounded-md bg-surface-sunken" style={{ animationDelay: `${i * 60 + 30}ms` }} />
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Loading placeholders in the TriageRow's anatomy: check · state · identity · title · facts, one line each. */
function RowSkeletons() {
  return (
    <ul aria-hidden className="flex flex-col border-t border-mode-rule">
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i} className="flex min-h-11 items-center gap-3 border-b border-mode-rule py-1.5 pl-4 pr-4">
          <span className="flex w-7 shrink-0 justify-center">
            <span className="block size-[18px] animate-pulse rounded-[5px] bg-mode-well" />
          </span>
          <span className="h-4 w-20 shrink-0 animate-pulse rounded-md bg-mode-well" />
          <span className="h-3.5 w-24 shrink-0 animate-pulse rounded-md bg-mode-well" />
          <span className="h-3.5 flex-1 animate-pulse rounded-md bg-mode-well" style={{ animationDelay: `${i * 40}ms` }} />
          <span className="h-3.5 w-28 shrink-0 animate-pulse rounded-md bg-mode-well" />
        </li>
      ))}
    </ul>
  );
}

export interface TriageListBodyProps {
  testIdPrefix: string;
  /** `row`: the one-row density — rows draw their own full-bleed hairline; the list opens with one. */
  density: 'card' | 'row';
  /** One shared horizontal scroll plane for opt-in wide Compact rows. */
  rowScroll?: boolean;
  noun: { one: string; many: string };
  /** The list's scroller — shared with the held-new hold and the page / find scroll. */
  scrollRef: RefObject<HTMLDivElement>;
  /** Cards on this page (section headers not counted). */
  cardCount: number;
  /** Header + card items, already keyed. */
  items: readonly ReactNode[];
  /** The list's accessible name ("Orders to ship"). */
  listLabel: string;
  /** Rows are loading or a search is in flight: skeletons while empty, `aria-busy` while not. */
  busy: boolean;
  /** Records the hold kept back, and the pill's release. */
  held: { count: number; release: () => void };
  /** Family entry above the cards (an inline new-record form). */
  leadSlot?: ReactNode;
  /** Empty because the status chips filtered everything out. */
  statusFiltered: { active: boolean; onReset: () => void };
  /** Empty because the search / filters matched nothing — the family's empty state; null when not narrowed. */
  searchEmpty: ReactNode | null;
  /** Empty with nothing narrowing it. */
  allClear: ReactNode;
  /** More on the server beyond the last loaded page; null when there is none (or it is not the last page). */
  loadMore: {
    /** Absent while a fetch is in flight. */
    onPress: (() => void) | undefined;
    fetching: boolean;
    searching: boolean;
    loaded: number;
    total: number;
  } | null;
  /** Scroll mode: the next chunk loads as the end nears. */
  scrollMode: boolean;
  /** sessionStorage prefix for the kept scroll place (per path). */
  scrollStorageKey: string;
}

export function TriageListBody({
  testIdPrefix,
  density,
  rowScroll = false,
  noun,
  scrollRef,
  cardCount,
  items,
  listLabel,
  busy,
  held,
  leadSlot,
  statusFiltered,
  searchEmpty,
  allClear,
  loadMore,
  scrollMode,
  scrollStorageKey,
}: TriageListBodyProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Scroll: bottom shadow, kept place, Scroll-mode loading ────────────────
  const [moreBelow, setMoreBelow] = useState(false);
  const keepScroll = useKeptScroll(scrollRef, cardCount > 0, scrollStorageKey);
  const measureEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, [scrollRef]);
  const onScroll = useCallback(() => {
    measureEdges();
    keepScroll();
  }, [measureEdges, keepScroll]);
  const onWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!rowScroll || !event.shiftKey || event.deltaX !== 0 || event.deltaY === 0) return;
      const el = event.currentTarget;
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    [rowScroll],
  );
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(measureEdges);
    observer.observe(el);
    observer.observe(content);
    measureEdges();
    return () => observer.disconnect();
  }, [measureEdges, scrollRef]);

  const loadNext = loadMore?.onPress;
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!scrollMode || !el || !root || !loadNext) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNext();
      },
      { root, rootMargin: '0px 0px 480px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollMode, loadNext, scrollRef]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* New records wait here instead of shoving the cards down. */}
      <AnimatePresence>
        {held.count > 0 ? (
          <motion.button
            key="new-records"
            type="button"
            data-testid={`${testIdPrefix}-new-orders`}
            onClick={held.release}
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            transition={SPRING}
            className={cn(
              'absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-text-default px-3 py-1.5 text-xs font-semibold text-surface-card shadow-elev-overlay',
              focusRing('control'),
            )}
          >
            <ArrowUp className="size-3.5" aria-hidden />
            {held.count} new {held.count === 1 ? noun.one : noun.many}
          </motion.button>
        ) : null}
      </AnimatePresence>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={onWheel}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto',
          rowScroll ? 'overflow-x-auto overscroll-x-none cf-grid-scrollbar' : 'overflow-x-hidden',
        )}
      >
        <div ref={contentRef} className="pb-6 pt-1">
          {leadSlot}
          {cardCount === 0 ? (
            busy ? (
              density === 'row' ? <RowSkeletons /> : <CardSkeletons />
            ) : statusFiltered.active ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="flex min-h-60 flex-col items-center justify-center gap-3 text-center"
              >
                <p className="text-sm text-text-muted">No {noun.many} match these statuses.</p>
                <button
                  type="button"
                  onClick={statusFiltered.onReset}
                  className={cn('rounded-full bg-text-default px-3 py-1.5 text-xs font-semibold text-surface-card', focusRing('control'))}
                >
                  Reset filters
                </button>
              </motion.div>
            ) : searchEmpty ? (
              <div className="flex min-h-60 items-center justify-center">{searchEmpty}</div>
            ) : (
              allClear
            )
          ) : (
            // Cards divide themselves with a hairline above (`[&+&]:before`), so
            // the list closes with its own hairline under the last card — the
            // table's bottom edge, the same inset as the dividers — and a
            // section head that follows a card draws that card's rule above
            // itself, so no card ends a section unruled. Rows close themselves
            // (`border-b`), so their list only opens with one.
            <ul
              role="list"
              aria-label={listLabel}
              aria-busy={busy}
              className={
                density === 'row'
                  ? 'flex flex-col border-t border-mode-rule'
                  : cn(
                      "flex min-w-0 max-w-full flex-col overflow-x-clip px-1 after:block after:h-px after:w-full after:bg-border-hairline after:content-['']",
                      SECTION_HEAD_RULE,
                    )
              }
            >
              <AnimatePresence initial={false}>{items}</AnimatePresence>
            </ul>
          )}

          {/* The end of what is loaded: more on the server. */}
          {cardCount > 0 && loadMore ? (
            <div ref={sentinelRef} className="flex justify-center pt-4">
              <button
                type="button"
                data-testid={`${testIdPrefix}-load-more`}
                disabled={!loadMore.onPress}
                onClick={() => loadMore.onPress?.()}
                className={cn(
                  'rounded-full border border-border-soft bg-surface-card px-4 py-2 text-xs font-medium text-text-default shadow-elev-soft transition-colors hover:border-border-strong disabled:opacity-60',
                  focusRing('control'),
                )}
              >
                {loadMore.fetching ? 'Loading…' : loadMore.searching ? 'Load more matches' : `Load more · ${loadMore.loaded} of ${loadMore.total} loaded`}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {/* The page's bottom edge while more cards sit below the fold: a hairline
          where the list is cut, over a soft shadow. */}
      <motion.div
        aria-hidden
        data-testid={`${testIdPrefix}-scroll-shadow`}
        data-visible={moreBelow ? '' : undefined}
        initial={false}
        animate={{ opacity: moreBelow ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/[0.11] via-black/[0.04] to-transparent"
      >
        <span className="absolute inset-x-0 bottom-0 h-px bg-border-hairline" />
      </motion.div>
    </div>
  );
}
