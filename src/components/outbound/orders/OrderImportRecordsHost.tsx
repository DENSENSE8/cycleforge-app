'use client';

/**
 * **Past imports** — the per-day record of what landed on the To-ship desk.
 *
 * "What was imported on the 2nd?" is a question about `orders.created_at`, and
 * every ingest path (Google Sheets sync, Ecwid / eBay / Zoho, CSV staging, hand
 * entry) already stamps it and names its channel in `account_source`. So this
 * surface reads facts that exist — there is no import-log table behind it.
 *
 * ## It is the SAME grid
 *
 * A queue that asks a different QUESTION over the same orders renders in the
 * desk's one grid, not in a table of its own — the law `cagedRecordToQueueRow`
 * and `exceptionRowToQueueRow` already established, and the whole point of the
 * 2026-08-29 one-table teardown. So this mounts `useOrdersSpreadsheet` with
 * adapted rows and changes exactly one thing about the feed:
 *
 *   - `showDayHeaders` — which is normally OFF on this table because absolute
 *     date is a per-row column. Here the DAY is the subject, so the sticky
 *     `DateGroupHeader` band with its per-day count IS the report line.
 *
 * Row order is the shared `?sort=` SoT (default ship-by). Newest-first day
 * bands are `?sort=newest` from the toolbar / header — not a frozen `sort=`
 * prop (that made outbound headers inert).
 *
 * `queueMode: 'shipped'` rather than `'fulfillment'`: fulfillment mode splices
 * an "Added today" section above the bands, which would swallow today's own day
 * band on the one view whose job is to show days.
 *
 * ## Two date controls, and why that is not two toolbars
 *
 * The ◀ ▶ steppers sit in this surface's identity band because stepping a day
 * is the primary gesture here and must be visible at rest. The CALENDAR is
 * `DataTable`'s own `dateMenu` chip beside the funnel — the house's one date
 * picker (operator ruling 2026-08-31). Deliberately NOT `DateRangePickerPill`
 * with `weekNav`: that control suppresses its stepper row whenever a calendar
 * is shown, and its source documents why ("it restates the period the calendar
 * already displays and stacks a second chevron pair above the month nav").
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { ChevronLeft, ChevronRight, Database, X } from '@/components/Icons';
import { DataTable } from '@/components/tables/DataTable';
import { useOrdersSpreadsheet } from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  importDayRangeForOffset,
  importDayRangeLength,
  importHistoryToday,
  importedOrderToQueueRow,
  normalizeImportDayRange,
  type ImportDayRange,
} from '@/lib/orders/import-history-core';
import { importHistoryQuery } from '@/lib/queries/import-history-queries';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import {
  addDaysToDateKey,
  dateKeyToLocalDate,
  formatWeekRangeCompact,
  localDateToDateKey,
} from '@/utils/date';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** URL keys — all four declared in `ORDERS_ROUTE_PARAMS` (hygiene strips the rest). */
const PARAM_ACTIVE = 'imports';
const PARAM_DAY = 'importDay';
const PARAM_FROM = 'importFrom';
const PARAM_TO = 'importTo';

/** One weekday + date, e.g. "Wed 3 Sep" — the single-day band label. */
function formatDayLabel(dayKey: string): string {
  const date = dateKeyToLocalDate(dayKey);
  if (!date) return dayKey;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * The period an operator is looking at, named the way they would say it.
 *
 * A single day gets the weekday ("Wed 3 Sep") because that is how a warehouse
 * refers to a day's intake; a range defers to the house's compact range
 * formatter so this view and the station history pills read alike.
 */
function formatRangeLabel(range: ImportDayRange, today: string): string {
  if (range.from !== range.to) return formatWeekRangeCompact(range.from, range.to);
  if (range.from === today) return 'Today';
  if (range.from === addDaysToDateKey(today, -1)) return 'Yesterday';
  return formatDayLabel(range.from);
}

export function OrderImportRecordsHost() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = importHistoryToday();

  // An explicit range wins over the day offset: a calendar pick is a statement,
  // a step is a walk from today.
  const picked = normalizeImportDayRange(
    { from: searchParams.get(PARAM_FROM), to: searchParams.get(PARAM_TO) },
    today,
  );
  const dayOffset = Math.max(0, Number(searchParams.get(PARAM_DAY)) || 0);
  const range = picked ?? importDayRangeForOffset(dayOffset, today);
  const source = searchParams.get('type');

  const writeParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${SHIPPING_ORDERS_PATH}?${qs}` : SHIPPING_ORDERS_PATH, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  /**
   * Step whole days. Stepping always leaves range mode — an operator who picked
   * the 1st–5th and then pressed ◀ means "the day before", not "shift a
   * five-day window", so the arrows collapse to a single day anchored on the
   * range's start.
   */
  const step = useCallback(
    (deltaDays: number) => {
      const anchor = range.from;
      const nextDay = addDaysToDateKey(anchor, deltaDays);
      // Never past today: there is no record of tomorrow's imports.
      if (!nextDay || nextDay > today) return;
      writeParams((params) => {
        params.delete(PARAM_FROM);
        params.delete(PARAM_TO);
        const offset = Math.round(
          (dateKeyToLocalDate(today)!.getTime() - dateKeyToLocalDate(nextDay)!.getTime()) /
            86_400_000,
        );
        if (offset <= 0) params.delete(PARAM_DAY);
        else params.set(PARAM_DAY, String(offset));
      });
    },
    [range.from, today, writeParams],
  );

  const setCalendarRange = useCallback(
    (next: DateRange | undefined) => {
      writeParams((params) => {
        const from = localDateToDateKey(next?.from);
        const to = localDateToDateKey(next?.to) || from;
        if (!from) {
          params.delete(PARAM_FROM);
          params.delete(PARAM_TO);
          params.delete(PARAM_DAY);
          return;
        }
        params.delete(PARAM_DAY);
        params.set(PARAM_FROM, from);
        params.set(PARAM_TO, to || from);
      });
    },
    [writeParams],
  );

  const close = useCallback(() => {
    writeParams((params) => {
      params.delete(PARAM_ACTIVE);
      params.delete(PARAM_DAY);
      params.delete(PARAM_FROM);
      params.delete(PARAM_TO);
    });
  }, [writeParams]);

  const query = useQuery(importHistoryQuery({ range, source }));

  /**
   * Find, over the period on screen. LOCAL state, not a URL param: the desk's
   * `?search` belongs to the live queue, and carrying a needle out of this view
   * would narrow the queue by something the operator typed about a past day.
   */
  const [find, setFind] = useState('');

  // SQL already banded the days; the grid re-bands from `created_at` so that
  // multi-line orders fold. Flatten in the order SQL returned so a truncated
  // page is truncated at the OLDEST row, never in the middle of a day.
  const records = useMemo(() => {
    const rows = (query.data?.days ?? []).flatMap(([, dayRecords]) =>
      dayRecords.map(importedOrderToQueueRow),
    );
    const needle = find.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.order_id,
        row.product_title,
        row.sku,
        row.item_number,
        row.shipping_tracking_number,
      ].some((value) => String(value ?? '').toLowerCase().includes(needle)),
    );
  }, [query.data, find]);

  const sheet = useOrdersSpreadsheet({
    records,
    loading: query.isLoading,
    searchValue: find,
    onOpenRecord: () => {},
    onClearSearch: () => setFind(''),
    // Not `fulfillment`: that mode lifts today's rows into an "Added today"
    // section above the bands, which is the one thing this view must not do.
    queueMode: 'shipped',
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    ariaLabel: 'Imported order records',
    emptyMessage: 'Nothing was imported in this period.',
    'data-testid': 'orders-imports-grid-body',
  });

  const calendarValue = useMemo<DateRange | undefined>(() => {
    const from = dateKeyToLocalDate(range.from);
    if (!from) return undefined;
    return { from, to: dateKeyToLocalDate(range.to) ?? from };
  }, [range.from, range.to]);

  const dayCount = importDayRangeLength(range);
  const total = query.data?.count ?? 0;
  const atToday = range.to >= today;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface-card">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border-soft bg-surface-card px-3 py-1">
        <div className="flex min-w-0 items-center gap-2" data-testid="orders-imports-identity">
          <Database className="h-4 w-4 shrink-0 text-text-soft" />
          {/* The steppers live HERE, not in a date popover: walking days is the
              primary gesture on this view, so it must be one click from rest. */}
          <span className="flex shrink-0 items-center gap-0.5">
            <IconButton
              size="sm"
              ariaLabel="Previous day"
              icon={<ChevronLeft className="h-3.5 w-3.5" />}
              onClick={() => step(-1)}
              data-testid="orders-imports-prev-day"
            />
            <IconButton
              size="sm"
              ariaLabel="Next day"
              icon={<ChevronRight className="h-3.5 w-3.5" />}
              onClick={() => step(1)}
              // No record of tomorrow — the same clamp the house week steppers
              // apply at `weekOffset === 0`.
              disabled={atToday}
              data-testid="orders-imports-next-day"
            />
          </span>
          <span
            className="truncate text-role-caption font-semibold text-text-default"
            data-testid="orders-imports-period"
          >
            {formatRangeLabel(range, today)}
          </span>
          <span className="shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
            {total} imported{dayCount > 1 ? ` · ${dayCount} days` : ''}
          </span>
          {query.data?.truncated ? (
            <span className="shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-warning">
              showing the newest {total}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={close}
            className={cn(cornerClass('flush'))}
            data-testid="orders-imports-close"
          >
            Back to queue
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden" data-testid="orders-imports-grid">
        <DataTable
          {...sheet}
          // The DAY is the subject here, so the sticky day band (and its count)
          // is the report line. Off on the live queue, where date is a column.
          showDayHeaders
          totalCount={total}
          search={{
            value: find,
            onChange: setFind,
            placeholder: 'Find in this period…',
          }}
          dateMenu={{ range: calendarValue, onRangeChange: setCalendarRange }}
          filter={
            (query.data?.sources ?? []).length > 0
              ? {
                  options: (query.data?.sources ?? []).map((row) => ({
                    id: row.source,
                    label: `${row.source} (${row.count})`,
                    active: source === row.source,
                  })),
                  onToggle: (id) =>
                    writeParams((params) => {
                      if (source === id) params.delete('type');
                      else params.set('type', String(id));
                    }),
                  onClearAll: () => writeParams((params) => params.delete('type')),
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
