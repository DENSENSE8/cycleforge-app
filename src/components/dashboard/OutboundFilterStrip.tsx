'use client';

/**
 * Outbound header filter pieces (right cluster):
 *
 * - {@link OutboundExactFilters} — icon-only Urgent + Filter popover
 *   (Pending tab: Urgent + Blocked; tabs own Pending / Tested)
 *
 * Resting chrome: [⚡] [⫶] — labels + counts live in the popover / tooltips.
 *
 * Keyboard (capture, Pending/Tested only, when not typing):
 *   `A` = clear filters · `1`/`2` = Pending/Tested tabs · `3` = Blocked · `4`/`U` = Urgent
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useState, startTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import { X, Zap } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import {
  FULFILLMENT_STATE_META,
  fulfillmentLaneTotals,
} from '@/lib/unshipped-state';
import { OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { packedOrdersQuery, unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { PACK_PLACED_PARAM, PACK_STATION_PARAM } from '@/lib/packing/pack-station-arm';
import { useShippedScanOutData } from '@/hooks/useShippedScanOutData';
import { parseStaffParam, useStaffFilter } from '@/hooks/useStaffFilter';
import { useOutboundStatusFilter } from '@/components/shipped/useOutboundStatusFilter';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import {
  isPrePackOrderView,
  normalizeDashboardOrderViewParams,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import {
  PACKED_ALL_DATES_PARAM,
  PACKED_DATE_FROM_PARAM,
  PACKED_DATE_TO_PARAM,
  packedAllDatesActive,
  packedCurrentWeekKeys,
  packedDateExactLabel,
  packedFiltersHot,
  packedFiltersHotLabel,
  packedShouldSeedCurrentWeek,
  packedStaffFilterOptions,
  parsePackedDateKey,
} from '@/lib/packed/packed-filters';
import { cn } from '@/utils/_cn';

type FilterMode = 'unshipped' | 'tested' | 'packed' | 'shipped';

const SHIPPED_ITEMS: { state: OutboundState; short: string; fold?: OutboundState }[] = [
  { state: 'PACKED_STAGED', short: 'Staging' },
  { state: 'SCANNED_OUT', short: 'Out' },
  { state: 'IN_CUSTODY', short: 'Custody' },
  { state: 'DELIVERED', short: 'Delivered' },
  { state: 'ORPHAN', short: 'Orphan' },
  { state: 'EXCEPTION', short: 'Exception', fold: 'PROCESS_GAP' },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
  return false;
}

function isPackedStaffTypeInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.getAttribute('placeholder') === 'Type a name…') return true;
  return Boolean(el.closest('[cmdk-input-wrapper]'));
}

function isPackedFindInput(el: EventTarget | null): boolean {
  return el instanceof HTMLInputElement && el.placeholder === 'Filter orders…';
}

/** `F` opens the Packed funnel even from the find field; not while typing a staff name. */
function packedFilterShortcutBlocked(el: EventTarget | null): boolean {
  if (isPackedStaffTypeInput(el)) return true;
  if (!isTypingTarget(el)) return false;
  if (isPackedFindInput(el)) return false;
  if (el instanceof HTMLElement && el.closest('[data-testid="packed-find-filters"]')) {
    return false;
  }
  return true;
}

/**
 * Toolbar + hotkey actions for Pending / Tested. Blocked + urgent share
 * {@link useToShipStatusFilter} / attention URL params; Pending/Tested tabs are
 * first-class views via {@link normalizeDashboardOrderViewParams}.
 *
 * Shared waist with {@link OutboundKpiStrip} queue tiles — one URL write path.
 */
export function useToShipFilterActions() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { active, toggle } = useToShipStatusFilter();
  // Wire param stays `attention` (deep-link / saved-pref stability); meaning is
  // now "urgent only" — operator-flagged expedited rows (orders.is_urgent).
  const urgentOnly =
    searchParams.get('attention') === '1' || searchParams.get('attention') === 'true';
  const packStationRaw = Number(searchParams.get(PACK_STATION_PARAM));
  const packStationId =
    Number.isFinite(packStationRaw) && packStationRaw > 0 ? packStationRaw : null;
  const packPlacedOnly =
    searchParams.get(PACK_PLACED_PARAM) === '1' || searchParams.get(PACK_PLACED_PARAM) === 'true';

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      // Filter / KPI URL writes are non-scan-critical — defer so paint stays calm.
      startTransition(() => {
        router.replace(
          qs ? `${pathname || '/shipping/orders'}?${qs}` : pathname || '/shipping/orders',
          { scroll: false },
        );
      });
    },
    [router, pathname, searchParams],
  );

  const selectLifecycleTab = useCallback(
    (view: 'unshipped' | 'tested') => {
      replaceParams((p) => {
        normalizeDashboardOrderViewParams(p, view);
      });
    },
    [replaceParams],
  );

  const selectAll = useCallback(() => {
    replaceParams((p) => {
      p.delete('ustatus');
      p.delete('stage');
      p.delete('late');
      p.delete('attention');
    });
  }, [replaceParams]);

  /** Full Pending tab — lifecycle view + clear OOS / urgent refines in one write. */
  const selectPendingTab = useCallback(() => {
    replaceParams((p) => {
      normalizeDashboardOrderViewParams(p, 'unshipped');
      p.delete('ustatus');
      p.delete('stage');
      p.delete('late');
      p.delete('attention');
    });
  }, [replaceParams]);

  /** Urgent = operator-flagged expedited rows (orders.is_urgent). */
  const toggleUrgent = useCallback(() => {
    replaceParams((p) => {
      if (p.get('attention') === '1' || p.get('attention') === 'true') {
        p.delete('attention');
        return;
      }
      p.set('attention', '1');
      p.delete('ustatus');
      p.delete('stage');
      p.delete('late');
    });
  }, [replaceParams]);

  /**
   * Packing-bench filter (`?packStation=`) — one bench, or none.
   *
   * Mutually exclusive with the aggregate `?packPlaced=1`: "placed anywhere"
   * and "placed at THIS bench" are two answers to one question, and holding
   * both would show the board a combination neither control is claiming.
   * Re-selecting the active bench clears it rather than re-applying.
   *
   * This lives here, beside the other To-ship filter writes, because this hook
   * is the surface's ONE URL write path — a second writer is how `packPlaced`
   * and `packStation` would drift out of that exclusion.
   */
  const togglePackStation = useCallback(
    (locationId: number) => {
      replaceParams((p) => {
        if (Number(p.get(PACK_STATION_PARAM)) === locationId) {
          p.delete(PACK_STATION_PARAM);
          return;
        }
        p.set(PACK_STATION_PARAM, String(locationId));
        p.delete(PACK_PLACED_PARAM);
      });
    },
    [replaceParams],
  );

  const clearPackPlacement = useCallback(() => {
    replaceParams((p) => {
      p.delete(PACK_STATION_PARAM);
      p.delete(PACK_PLACED_PARAM);
    });
  }, [replaceParams]);

  /** "Placed anywhere" — the aggregate the KPI tile also toggles. */
  const togglePackPlaced = useCallback(() => {
    replaceParams((p) => {
      if (p.get(PACK_PLACED_PARAM) === '1' || p.get(PACK_PLACED_PARAM) === 'true') {
        p.delete(PACK_PLACED_PARAM);
        return;
      }
      p.set(PACK_PLACED_PARAM, '1');
      p.delete(PACK_STATION_PARAM);
    });
  }, [replaceParams]);

  const toggleBlocked = useCallback(() => {
    // Blocked lives under Pending — jump there if needed, then toggle.
    replaceParams((p) => {
      normalizeDashboardOrderViewParams(p, 'unshipped');
      if (p.get('ustatus') === 'BLOCKED') p.delete('ustatus');
      else {
        p.set('ustatus', 'BLOCKED');
        p.delete('stage');
        p.delete('attention');
      }
    });
  }, [replaceParams]);

  return {
    active,
    urgentOnly,
    packStationId,
    packPlacedOnly,
    selectAll,
    selectPendingTab,
    toggle,
    toggleUrgent,
    toggleBlocked,
    togglePackStation,
    togglePackPlaced,
    clearPackPlacement,
    selectLifecycleTab,
  };
}

export function useToShipFilterHotkeys(enabled: boolean) {
  const { selectAll, toggleUrgent, toggleBlocked, selectLifecycleTab } = useToShipFilterActions();

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;

      const code = e.code;
      if (code === 'KeyA') {
        e.preventDefault();
        e.stopPropagation();
        selectAll();
        return;
      }
      if (code === 'Digit4' || code === 'Numpad4' || code === 'KeyU') {
        e.preventDefault();
        e.stopPropagation();
        toggleUrgent();
        return;
      }
      if (code === 'Digit1' || code === 'Numpad1') {
        e.preventDefault();
        e.stopPropagation();
        selectLifecycleTab('unshipped');
        return;
      }
      if (code === 'Digit2' || code === 'Numpad2') {
        e.preventDefault();
        e.stopPropagation();
        selectLifecycleTab('tested');
        return;
      }
      if (code === 'Digit3' || code === 'Numpad3') {
        e.preventDefault();
        e.stopPropagation();
        toggleBlocked();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, selectAll, toggleUrgent, toggleBlocked, selectLifecycleTab]);
}

type PackedFindFocus = 'staff' | 'date' | null;

/**
 * Packed Band-3 find chrome — exact staff / date chips + funnel **left of paste**
 * (`trailingPrefix`), same left-of-paste grammar as the sheet week pill.
 * Starting window is the warehouse current week; `allDates=1` is the intentional
 * clear so dismiss does not re-seed. Click a chip to edit that facet; X dismisses.
 */
export function usePackedFindFieldChrome(): {
  trailingPrefix: ReactNode;
  inlineContentKey: string | undefined;
} {
  const [open, setOpen] = useState(false);
  const [focusSection, setFocusSection] = useState<PackedFindFocus>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { staffId, selectedName, setStaff } = useStaffFilter();
  const dateFrom = parsePackedDateKey(searchParams.get(PACKED_DATE_FROM_PARAM));
  const dateTo = parsePackedDateKey(searchParams.get(PACKED_DATE_TO_PARAM));
  const allDates = packedAllDatesActive(searchParams.get(PACKED_ALL_DATES_PARAM));
  const searchQuery = String(searchParams.get('search') || '').trim();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const rosterQuery = useQuery({
    ...packedOrdersQuery({
      searchQuery: deferredSearchQuery,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
    }),
  });
  const packedStaffOptions = useMemo(
    () => packedStaffFilterOptions(rosterQuery.data ?? []),
    [rosterQuery.data],
  );
  const staffName =
    packedStaffOptions.find((option) => option.value === staffId)?.label ?? selectedName;
  const dateRange: DateRange | undefined = dateFrom
    ? {
        from: dateKeyToLocalDate(dateFrom),
        to: dateKeyToLocalDate(dateTo ?? dateFrom),
      }
    : undefined;

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      startTransition(() => {
        router.replace(
          qs ? `${pathname || '/shipping/orders'}?${qs}` : pathname || '/shipping/orders',
          { scroll: false },
        );
      });
    },
    [router, pathname, searchParams],
  );

  // Seed current week on Packed landing (no range, not intentionally cleared).
  useEffect(() => {
    if (!packedShouldSeedCurrentWeek({ dateFrom, dateTo, allDates })) return;
    const week = packedCurrentWeekKeys();
    replaceParams((p) => {
      p.delete(PACKED_ALL_DATES_PARAM);
      p.set(PACKED_DATE_FROM_PARAM, week.dateFrom);
      p.set(PACKED_DATE_TO_PARAM, week.dateTo);
    });
  }, [allDates, dateFrom, dateTo, replaceParams]);

  const setDateRange = useCallback(
    (next: DateRange | undefined) => {
      replaceParams((p) => {
        const from = localDateToDateKey(next?.from);
        const to = localDateToDateKey(next?.to ?? next?.from);
        if (from) {
          p.delete(PACKED_ALL_DATES_PARAM);
          p.set(PACKED_DATE_FROM_PARAM, from);
        } else {
          p.delete(PACKED_DATE_FROM_PARAM);
        }
        if (to) p.set(PACKED_DATE_TO_PARAM, to);
        else p.delete(PACKED_DATE_TO_PARAM);
        if (!from && !to) p.set(PACKED_ALL_DATES_PARAM, '1');
      });
    },
    [replaceParams],
  );

  const clearPackedFilters = useCallback(() => {
    setStaff(null);
    replaceParams((p) => {
      p.delete(PACKED_DATE_FROM_PARAM);
      p.delete(PACKED_DATE_TO_PARAM);
      p.set(PACKED_ALL_DATES_PARAM, '1');
    });
  }, [replaceParams, setStaff]);

  const openSection = useCallback((section: PackedFindFocus) => {
    setFocusSection(section);
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setFocusSection(null);
  }, []);

  const hot = packedFiltersHot({ staffId, dateFrom, dateTo });
  const hotLabel = packedFiltersHotLabel({
    staffName,
    dateFrom,
    dateTo,
  });
  const exactLabel = packedFiltersHotLabel({
    staffName,
    dateFrom,
    dateTo,
    exactDates: true,
  });
  const dateExact = packedDateExactLabel(dateFrom, dateTo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code === 'KeyF') {
        if (
          packedFilterShortcutBlocked(e.target)
          || packedFilterShortcutBlocked(document.activeElement)
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        openSection('staff');
        return;
      }
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (e.code === 'KeyA') {
        e.preventDefault();
        e.stopPropagation();
        clearPackedFilters();
        handleOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [clearPackedFilters, handleOpenChange, openSection]);

  useEffect(() => {
    if (!rosterQuery.isSuccess || staffId == null) return;
    if (!packedStaffOptions.some((option) => option.value === staffId)) {
      setStaff(null);
    }
  }, [packedStaffOptions, rosterQuery.isSuccess, setStaff, staffId]);

  // Chip / F → staff: open the type-in list once the funnel is mounted.
  useEffect(() => {
    if (!open || focusSection !== 'staff') return;
    const id = window.requestAnimationFrame(() => {
      const trigger = document.querySelector<HTMLElement>(
        '[data-testid="packed-staff-combobox"]',
      );
      trigger?.click();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, focusSection]);

  const staffOptions = [{ value: 0, label: 'All staff' }, ...packedStaffOptions];

  const filterChips = exactLabel ? (
    <>
      <span
        data-testid="packed-filter-status"
        data-search-inline-label=""
        className="flex h-full min-w-0 items-center gap-1"
      >
        {staffName ? (
          <button
            type="button"
            data-testid="packed-filter-staff-chip"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openSection('staff')}
            className="max-w-[9rem] truncate whitespace-nowrap text-sm font-semibold text-text-default hover:text-blue-700"
            aria-label={`Edit staff filter (${staffName})`}
          >
            {staffName}
          </button>
        ) : null}
        {staffName && dateExact ? (
          <span className="text-sm font-semibold text-text-faint" aria-hidden>
            ·
          </span>
        ) : null}
        {dateExact ? (
          <button
            type="button"
            data-testid="packed-filter-date-chip"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openSection('date')}
            className="whitespace-nowrap text-sm font-semibold uppercase tracking-wide text-text-default hover:text-blue-700"
            aria-label={`Edit date filter (${dateExact})`}
          >
            {dateExact}
          </button>
        ) : null}
      </span>
      <button
        type="button"
        data-search-inline-clear=""
        data-testid="packed-filter-clear"
        onMouseDown={(e) => e.preventDefault()}
        onClick={clearPackedFilters}
        aria-label="Clear packed filters"
        className="inline-flex h-full w-5 shrink-0 items-center justify-center text-text-faint hover:text-text-default"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </>
  ) : null;

  const trailingPrefix = (
    <span data-testid="packed-find-filters" className="flex h-full items-center gap-0.5">
      {filterChips}
      <WorkbenchFilterPopover
        open={open}
        onOpenChange={handleOpenChange}
        hot={hot}
        hotActiveLabel={hotLabel}
        label="Filters (F)"
        density="field"
        retainSearchFocus={false}
        contentClassName="w-72 max-h-[min(70vh,32rem)] overflow-y-auto"
      >
        <WorkbenchFilterGroupLabel>Staff</WorkbenchFilterGroupLabel>
        <div className="px-2 pb-2">
          <SearchableSelectField
            key={focusSection === 'staff' ? 'staff-focus' : 'staff'}
            value={staffId ?? 0}
            onChange={(value) => {
              const id = typeof value === 'number' ? value : Number(value);
              setStaff(Number.isFinite(id) && id > 0 ? id : null);
            }}
            options={staffOptions}
            placeholder="All staff"
            searchPlaceholder="Type a name…"
            emptyMessage="No matching staff"
            ariaLabel="Staff"
            className="h-9"
            testId="packed-staff-combobox"
            autoFocus={focusSection === 'staff' || focusSection == null}
          />
        </div>
        <WorkbenchFilterDivider />
        <WorkbenchFilterGroupLabel>Packed between</WorkbenchFilterGroupLabel>
        <div className="px-2 pb-2" data-testid="packed-date-range">
          <DateRangePickerField
            key={focusSection === 'date' ? 'date-focus' : 'date'}
            value={dateRange}
            onChange={setDateRange}
            placeholder="Any date"
            autoOpen={focusSection === 'date'}
          />
        </div>
        {hot ? (
          <>
            <WorkbenchFilterDivider />
            <WorkbenchFilterMenuRow
              label="Clear filters"
              active={false}
              shortcut="A"
              onClick={() => {
                clearPackedFilters();
                handleOpenChange(false);
              }}
            />
          </>
        ) : null}
      </WorkbenchFilterPopover>
    </span>
  );

  return {
    trailingPrefix,
    inlineContentKey: exactLabel,
  };
}

/** Packed staff / exact date window — glanceable measurement key. */
export function usePackedFindHotLabel(): string | undefined {
  const searchParams = useSearchParams();
  const { selectedName } = useStaffFilter();
  const dateFrom = parsePackedDateKey(searchParams.get(PACKED_DATE_FROM_PARAM));
  const dateTo = parsePackedDateKey(searchParams.get(PACKED_DATE_TO_PARAM));
  return packedFiltersHotLabel({
    staffName: selectedName,
    dateFrom,
    dateTo,
    exactDates: true,
  });
}

/** Icon-only Urgent + Filter popover (Blocked + clear). */
export function OutboundExactFilters({ mode }: { mode: FilterMode }) {
  if (mode === 'packed') return null;
  return mode === 'shipped' ? <ShippedExactFilters /> : <ToShipExactFilters mode={mode} />;
}

function ToShipExactFilters({ mode }: { mode: 'unshipped' | 'tested' }) {
  const { active, urgentOnly, selectAll, toggleBlocked, toggleUrgent } = useToShipFilterActions();
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const { data } = useQuery(unshippedQueueCountsQuery({ staffId }));
  // Lane totals via the shared SoT — a tab number must equal the rows it shows.
  const laneTotals = fulfillmentLaneTotals(data);
  const blockedCount = laneTotals.blocked;
  const pendingCount = laneTotals.pending;
  const urgentCount = data?.urgent ?? 0;
  const blockedActive = active === 'BLOCKED';
  const allActive = !blockedActive && !urgentOnly;
  const laneHot = blockedActive || urgentOnly;
  const tabCount = mode === 'tested' ? laneTotals.tested : pendingCount;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <HoverTooltip label="Urgent" asChild>
        <ToolbarButton
          iconOnly
          active={urgentOnly}
          aria-pressed={urgentOnly}
          onClick={toggleUrgent}
          aria-label="Urgent"
          className="h-7 w-7"
        >
          <Zap className={cn('h-3.5 w-3.5 shrink-0 text-amber-500', urgentOnly && 'fill-current text-inherit')} />
        </ToolbarButton>
      </HoverTooltip>

      {/* Just "Filters" — the trigger tooltip does NOT enumerate hotkeys. The
          menu already prints each shortcut as a `kbd` chip on the row it acts
          on, so a trigger-level list is a second copy that drifts (it still
          named Pending/Tested tab jumps long after those became tabs). */}
      <WorkbenchFilterPopover open={open} onOpenChange={setOpen} hot={laneHot} label="Filters">
        <WorkbenchFilterGroupLabel>Filters</WorkbenchFilterGroupLabel>
        <WorkbenchFilterMenuRow
          label={mode === 'tested' ? 'All tested' : 'All on tab'}
          count={tabCount}
          active={allActive}
          shortcut="A"
          onClick={() => {
            selectAll();
            setOpen(false);
          }}
        />
        <WorkbenchFilterDivider />
        <WorkbenchFilterMenuRow
          label="Urgent"
          count={urgentCount}
          active={urgentOnly}
          shortcut="4"
          leading={<span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
          onClick={() => {
            toggleUrgent();
            setOpen(false);
          }}
        />
        {mode === 'unshipped' ? (
          <WorkbenchFilterMenuRow
            label="Out of stock"
            count={blockedCount}
            active={blockedActive}
            shortcut="3"
            leading={
              <span className={cn('h-2 w-2 shrink-0 rounded-full', FULFILLMENT_STATE_META.BLOCKED.dot)} />
            }
            onClick={() => {
              toggleBlocked();
              setOpen(false);
            }}
          />
        ) : null}
      </WorkbenchFilterPopover>
    </div>
  );
}

function ShippedExactFilters() {
  const { active, toggle, clear } = useOutboundStatusFilter();
  const { total } = useShippedScanOutData();
  const [open, setOpen] = useState(false);
  const allActive = active == null;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <WorkbenchFilterPopover
        open={open}
        onOpenChange={setOpen}
        hot={active != null}
        label="Status filters"
      >
        <WorkbenchFilterGroupLabel>Status</WorkbenchFilterGroupLabel>
        <WorkbenchFilterMenuRow
          label="All"
          count={total}
          active={allActive}
          onClick={() => {
            clear();
            setOpen(false);
          }}
        />
        <WorkbenchFilterDivider />
        {SHIPPED_ITEMS.map(({ state, short }) => {
          const isOn = active === state;
          const m = OUTBOUND_STATE_META[state];
          return (
            <WorkbenchFilterMenuRow
              key={state}
              label={short}
              active={isOn}
              leading={<span className={cn('h-2 w-2 shrink-0 rounded-full', m.dot)} />}
              onClick={() => {
                toggle(state);
                setOpen(false);
              }}
            />
          );
        })}
      </WorkbenchFilterPopover>
    </div>
  );
}

/** @deprecated Prefer {@link OutboundExactFilters}. */
export function OutboundFilterStrip({ mode }: { mode: FilterMode }) {
  useToShipFilterHotkeys(isPrePackOrderView(mode as DashboardOrderView));
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <OutboundExactFilters mode={mode} />
    </div>
  );
}
