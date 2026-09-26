'use client';

/**
 * The Shipped ledger's toolbar — find box + period + type / carrier / status
 * facets + exceptions-only, every control writing the SAME URL state the
 * packer-log week feed reads (`useShippedTableFilters`,
 * `useShippedFilterActions`), so a bookmark and the old table's params stay
 * one vocabulary. Free text is the server's `?q=` inside the period.
 */

import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SearchField,
} from '@/design-system/primitives';
import type { ShippedTableFilters } from '@/components/shipped/dashboard-table/useShippedTableFilters';
import {
  CARRIERS,
  STATUS_CATEGORIES,
  TYPE_ITEMS,
  type ShippedTypeFilter,
} from '@/components/shipping/shipped-filter/shipped-filter-constants';
import type { CarrierCode, ShipmentStatusCategory } from '@/components/shipping/ShipmentStatusBadge';
import { parseISODate, toISODate } from '@/lib/shipping/shipped-filter/shipped-filter-params';

/** The facet state + writers the toolbar drives (`useShippedFilterActions`). */
export interface ShippedFacetControls {
  carrier: CarrierCode | null;
  statusCategory: ShipmentStatusCategory | null;
  exceptionsOnly: boolean;
  setCarrier: (next: CarrierCode | null) => void;
  setStatus: (next: ShipmentStatusCategory | null) => void;
  toggleExceptions: () => void;
}

export function ShippedLedgerToolbar({
  filters,
  refine,
  isSearching,
}: {
  filters: Pick<
    ShippedTableFilters,
    | 'search'
    | 'setSearch'
    | 'effectiveWeekStart'
    | 'effectiveWeekEnd'
    | 'setPeriodRange'
    | 'clearPeriod'
    | 'shippedFilter'
    | 'applyShippedFilter'
  >;
  refine: ShippedFacetControls;
  isSearching: boolean;
}) {
  const period =
    filters.effectiveWeekStart && filters.effectiveWeekEnd
      ? { from: parseISODate(filters.effectiveWeekStart), to: parseISODate(filters.effectiveWeekEnd) }
      : undefined;
  const typeLabel = TYPE_ITEMS.find((item) => item.id === filters.shippedFilter)?.label ?? 'All';
  const carrierLabel = CARRIERS.find((c) => c.value === refine.carrier)?.label;
  const statusLabel = STATUS_CATEGORIES.find((s) => s.value === refine.statusCategory)?.label;

  return (
    <>
      <SearchField
        value={filters.search}
        onChange={filters.setSearch}
        placeholder="Find tracking, order #, SKU, title…"
        isSearching={isSearching}
        className="min-w-0 flex-1 overflow-hidden rounded-none pl-2"
        tone="neutral"
        hideUnderline
        fillHost
      />
      <span className="flex shrink-0 items-center border-l border-mode-edge px-1.5">
        <DateRangePickerField
          value={period}
          onChange={(next) => {
            const from = toISODate(next?.from);
            const to = toISODate(next?.to ?? next?.from);
            if (from && to) filters.setPeriodRange(from, to);
            else filters.clearPeriod();
          }}
          placeholder="All dates"
        />
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            {filters.shippedFilter === 'all' ? 'Type' : typeLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TYPE_ITEMS.map((item) => (
            <DropdownMenuItem
              key={String(item.id)}
              onSelect={() => filters.applyShippedFilter(String(item.id) as ShippedTypeFilter)}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            {carrierLabel ?? 'Carrier'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => refine.setCarrier(null)}>All carriers</DropdownMenuItem>
          {CARRIERS.map((carrier) => (
            <DropdownMenuItem key={carrier.value} onSelect={() => refine.setCarrier(carrier.value as CarrierCode)}>
              {carrier.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            {statusLabel ?? 'Status'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => refine.setStatus(null)}>All statuses</DropdownMenuItem>
          {STATUS_CATEGORIES.map((status) => (
            <DropdownMenuItem key={status.value} onSelect={() => refine.setStatus(status.value as ShipmentStatusCategory)}>
              {status.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant={refine.exceptionsOnly ? 'ink' : 'ghost'}
        size="sm"
        aria-pressed={refine.exceptionsOnly}
        onClick={refine.toggleExceptions}
      >
        Exceptions only
      </Button>
    </>
  );
}
