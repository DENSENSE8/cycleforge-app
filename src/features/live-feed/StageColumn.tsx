'use client';

/**
 * One stage of the board: a header that answers "how many, how bad" and a
 * list of cards that scrolls on its own. The board hands over the first page;
 * the column fetches the next one only when its end scrolls into view.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown } from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { Button } from '@/design-system/primitives/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/design-system/primitives/DropdownMenu';
import { Spinner } from '@/design-system/primitives/Spinner';
import { liveFeedLaneQuery } from '@/lib/live-feed/query';
import type { LiveFeedFilters } from '@/lib/live-feed/route';
import {
  PACKAGE_SORT_LABEL,
  PACKAGE_STAGE_META,
  PACKAGE_STAGE_SORTS,
  type PackageSort,
  type PackageStage,
} from '@/lib/live-feed/stages';
import type { PackageCard as PackageCardData, PackageColumn } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';
import { PackageCard, type PackageCheckMode } from './PackageCard';
import { STAGE_LOOK } from './stage-look';

function ColumnMeta({ column }: { column: PackageColumn }) {
  if (column.stage === 'scanned_out') {
    const previous = column.previousCount ?? 0;
    const delta = column.count - previous;
    if (delta === 0) return <span>Same as yesterday</span>;
    return (
      <span>
        <span className={cn('font-semibold', delta > 0 ? 'text-emerald-600' : 'text-rose-600')}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
        </span>{' '}
        vs yesterday
      </span>
    );
  }
  const parts: ReactNode[] = [];
  if (column.lateCount > 0) {
    parts.push(
      <span key="late" className="font-semibold text-rose-600">
        {column.lateCount} late
      </span>,
    );
  }
  if (column.stalledCount > 0) {
    parts.push(
      <span key="stalled" className="font-semibold text-amber-700">
        {column.stalledCount} stalled
      </span>,
    );
  }
  if (column.earlierCount > 0) parts.push(<span key="earlier">{column.earlierCount} from earlier</span>);
  if (parts.length === 0) return <span>All on time</span>;
  return (
    <>
      {parts.flatMap((part, index) => (index === 0 ? [part] : [<span key={`dot-${index}`} aria-hidden className="text-slate-300">·</span>, part]))}
    </>
  );
}

export function StageColumnHeader({
  column,
  sort,
  onSort,
}: {
  column: PackageColumn;
  sort: PackageSort;
  onSort?: (stage: PackageStage, sort: PackageSort) => void;
}) {
  const look = STAGE_LOOK[column.stage];
  const label = PACKAGE_STAGE_META[column.stage].label;
  return (
    <header className="flex items-center gap-3 px-3 pb-2 pt-3 @max-[13rem]/col:gap-2">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset @max-[13rem]/col:hidden', look.tile)}>
        <look.Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-slate-900">{label}</h2>
        <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
          <ColumnMeta column={column} />
        </p>
        {onSort ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconRight={<ChevronDown className="size-3.5" />}
                ariaLabel={`Sort ${label}: ${PACKAGE_SORT_LABEL[sort]}`}
                data-testid={`live-feed-sort-${column.stage}`}
                className="-ml-2 mt-0.5 h-6 px-2 text-xs font-medium"
              >
                {PACKAGE_SORT_LABEL[sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PACKAGE_STAGE_SORTS[column.stage].map((choice) => (
                <DropdownMenuItem
                  key={choice}
                  aria-current={choice === sort ? 'true' : undefined}
                  className={cn(choice === sort && 'font-semibold')}
                  onSelect={() => onSort(column.stage, choice)}
                  data-testid={`live-feed-sort-${column.stage}-${choice}`}
                >
                  {PACKAGE_SORT_LABEL[choice]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900 @max-[13rem]/col:text-2xl" data-testid={`live-feed-count-${column.stage}`}>
        <AnimatedStat value={column.count} />
      </span>
    </header>
  );
}

export function StageColumn({
  column,
  filters,
  sort,
  onSort,
  now,
  selectedId,
  checkedIds,
  checkMode,
  onOpen,
  onToggleCheck,
  className,
  showHeader = true,
}: {
  column: PackageColumn;
  filters: LiveFeedFilters;
  /** The column's order (`resolvePackageSorts(filters.sorts)[stage]`). */
  sort: PackageSort;
  onSort?: (stage: PackageStage, sort: PackageSort) => void;
  now: number | null;
  selectedId: number | null;
  checkedIds: ReadonlySet<number>;
  /** `hover` = desk at rest; `shown` = a selection is open (taps toggle); `off` = phone outside select mode. */
  checkMode: PackageCheckMode;
  onOpen: (card: PackageCardData) => void;
  onToggleCheck: (card: PackageCardData, event: { shiftKey: boolean }) => void;
  className?: string;
  showHeader?: boolean;
}) {
  const look = STAGE_LOOK[column.stage];
  const [wanted, setWanted] = useState(false);
  const lane = useInfiniteQuery({ ...liveFeedLaneQuery(column.stage, filters), enabled: wanted && column.hasMore });
  const pages = lane.data?.pages;
  const items = useMemo(() => {
    if (!pages?.length) return column.items;
    const seen = new Set(column.items.map((item) => item.orderRowId));
    const more = pages.flatMap((page) => page.items).filter((item) => !seen.has(item.orderRowId));
    return [...column.items, ...more];
  }, [column.items, pages]);
  const hasMore = pages?.length ? Boolean(pages.at(-1)?.hasMore) : column.hasMore;

  // The list's end in view asks for the next page — once per page: the
  // observer lives as long as the column has more, and reads the query's
  // latest state from a ref instead of re-subscribing on every fetch.
  const endRef = useRef<HTMLDivElement>(null);
  const pagingRef = useRef({ wanted, lane });
  pagingRef.current = { wanted, lane };
  useEffect(() => {
    const end = endRef.current;
    if (!end || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const { wanted: started, lane: current } = pagingRef.current;
        if (!started) setWanted(true);
        else if (current.hasNextPage && !current.isFetching) void current.fetchNextPage({ cancelRefetch: false });
      },
      { rootMargin: '240px' },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasMore, pages?.length]);

  return (
    <section
      data-column={column.stage}
      data-testid={`live-feed-column-${column.stage}`}
      aria-label={`${PACKAGE_STAGE_META[column.stage].label}: ${column.count}`}
      className={cn('@container/col flex min-h-0 flex-col rounded-2xl bg-slate-100/80 ring-1 ring-inset ring-slate-900/5', className)}
    >
      <span aria-hidden className={cn('mx-3 mt-3 h-1 rounded-full', look.solid)} />
      {showHeader ? <StageColumnHeader column={column} sort={sort} onSort={onSort} /> : null}
      {/* pt-1: breathing room for the first card's shadow. pb-16: the list's end scrolls clear of the floating bulk pills.
          Card state outlines are overlay borders inside the card, so the scroller's clip never cuts them. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-16 pt-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className={cn('flex size-10 items-center justify-center rounded-2xl ring-1 ring-inset', look.tile)}>
              <look.Icon className="size-5" />
            </span>
            <p className="text-sm text-slate-500">{PACKAGE_STAGE_META[column.stage].empty}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((card) => (
              <li key={card.orderRowId}>
                <PackageCard
                  card={card}
                  now={now}
                  selected={card.orderRowId === selectedId}
                  checked={checkedIds.has(card.orderRowId)}
                  checkMode={checkMode}
                  onOpen={onOpen}
                  onToggleCheck={onToggleCheck}
                />
              </li>
            ))}
          </ul>
        )}
        {hasMore ? (
          <div ref={endRef} className="flex items-center justify-center gap-2 py-3 text-xs text-slate-500">
            <Spinner size="sm" /> Loading more
          </div>
        ) : items.length > 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">
            {items.length === column.count ? `All ${column.count}` : `${items.length} of ${column.count}`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
