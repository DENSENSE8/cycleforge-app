'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import type { LocationStockRoomFacet, LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import {
  stockLocationMatches,
  summarizeStockLocations,
  type StockLocationSummary,
} from '@/lib/inventory/stock-location-summary';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { cn } from '@/utils/_cn';
import { useMobileV2Search } from '../MobileV2SearchContext';

const PAGE_SIZE = 50;

function countLabel(value: number, singular: string): string {
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}

function roomHref(room: string, legacyQuery: string): string {
  const params = new URLSearchParams({ room });
  if (legacyQuery) params.set('q', legacyQuery);
  return `/m/stock?${params.toString()}`;
}

function LocationRow({ summary, returnTo }: { summary: StockLocationSummary; returnTo: string }) {
  const href = summary.routeCode
    ? withJobReturn(locationHubPath(summary.routeCode), returnTo)
    : null;
  const className = cn(
    'grid min-h-14 w-full grid-cols-[1.25rem_minmax(0,1fr)_auto_1rem] items-center gap-2 border-b border-border-soft px-3 py-2 text-left',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent',
    href ? 'bg-surface-card active:bg-surface-selected' : 'cursor-not-allowed bg-surface-sunken',
  );
  const content = (
    <>
      <span
        className={cn(
          'h-2.5 w-2.5 justify-self-center rounded-full',
          summary.hasException || summary.hasOnHold
            ? 'bg-amber-500'
            : summary.empty
              ? 'border border-border-strong bg-transparent'
              : 'bg-emerald-500',
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-mono text-sm font-semibold text-text-default">{summary.face}</span>
          {summary.hasOnHold ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">Hold</span>
          ) : null}
        </span>
        <span className="block truncate text-[11px] leading-4 text-text-soft">
          {summary.room ?? (summary.hasException ? 'Needs a location' : 'No room')}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-bold tabular-nums text-text-default">{summary.quantity}</span>
        <span className="block whitespace-nowrap text-[10px] leading-4 text-text-soft">
          {summary.empty ? 'Empty' : countLabel(summary.skuCount, 'SKU')}
        </span>
      </span>
      {href ? <ChevronRight className="h-4 w-4 text-text-faint" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
    </>
  );

  if (!href) {
    return (
      <div aria-label={`${summary.face} has no scannable location`} aria-disabled="true" className={className} data-testid="stock-location-row">
        {content}
      </div>
    );
  }
  return (
    <Link href={href} aria-label={`Open location ${summary.face}`} className={className} data-testid="stock-location-row">
      {content}
    </Link>
  );
}

/** Location-first stock for phones, tablets and narrow desktop windows. */
export function MobileV2StockLocations({
  rows,
  rooms,
  activeRoom,
  legacyQuery,
  requestedPage,
  capped,
}: {
  rows: LocationStockTableRow[];
  rooms: LocationStockRoomFacet[];
  activeRoom: string | null;
  legacyQuery: string;
  requestedPage: string | null;
  capped: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const contextualSearch = useMobileV2Search();
  const query = contextualSearch.query.trim() || legacyQuery.trim();
  const summaries = useMemo(
    () => summarizeStockLocations(rows).filter((summary) => stockLocationMatches(summary, query)),
    [query, rows],
  );
  const requested = Number.parseInt(requestedPage ?? '', 10);
  const [page, setPage] = useState(Number.isFinite(requested) && requested > 0 ? requested : 1);
  const pageCount = Math.max(1, Math.ceil(summaries.length / PAGE_SIZE));
  const livePage = Math.min(page, pageCount);
  const visible = summaries.slice((livePage - 1) * PAGE_SIZE, livePage * PAGE_SIZE);
  const currentUrl = `${pathname}?${searchParams.toString()}`.replace(/\?$/, '');

  useEffect(() => setPage(1), [activeRoom, query]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col bg-surface-card" data-testid="mobile-v2-stock">
      <div className="sticky top-0 z-sticky border-b border-border-soft bg-surface-card/95 backdrop-blur">
        <nav className="flex gap-2 overflow-x-auto px-3 py-2" aria-label="Warehouse rooms">
          {rooms.map((room) => {
            const active = room.id === activeRoom;
            return (
              <Link
                key={room.id}
                href={roomHref(room.id, legacyQuery)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold',
                  active
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-border-soft bg-surface-card text-text-default',
                )}
              >
                {room.label}
                <span className={cn('tabular-nums', active ? 'text-white/75' : 'text-text-soft')}>{room.count}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex h-8 items-center justify-between px-3 text-[11px] text-text-soft">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {countLabel(summaries.length, 'location')}
          </span>
          {query ? <span className="max-w-[55%] truncate">Matching “{query}”</span> : null}
        </div>
      </div>

      <div className="flex-1">
        {visible.length > 0 ? visible.map((summary) => (
          <LocationRow key={summary.key} summary={summary} returnTo={currentUrl} />
        )) : (
          <div className="px-6 py-16 text-center">
            <MapPin className="mx-auto h-6 w-6 text-text-faint" />
            <p className="mt-2 text-sm font-semibold text-text-default">No locations found</p>
            <p className="mt-1 text-xs text-text-soft">Try another room or clear search.</p>
          </div>
        )}
      </div>

      {capped ? (
        <p className="border-t border-border-soft bg-surface-warning px-3 py-2 text-xs text-text-warning">
          This room is larger than the live feed. Search to narrow it.
        </p>
      ) : null}
      {pageCount > 1 ? (
        <nav className="sticky bottom-0 grid grid-cols-[2.75rem_1fr_2.75rem] items-center border-t border-border-soft bg-surface-card p-2" aria-label="Stock pages">
          <IconButton
            size="touch"
            radius="surface"
            ariaLabel="Previous stock page"
            icon={<ChevronLeft className="h-5 w-5" />}
            disabled={livePage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          />
          <span className="text-center text-xs font-semibold tabular-nums text-text-soft">{livePage} / {pageCount}</span>
          <IconButton
            size="touch"
            radius="surface"
            ariaLabel="Next stock page"
            icon={<ChevronRight className="h-5 w-5" />}
            disabled={livePage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          />
        </nav>
      ) : null}
    </div>
  );
}
