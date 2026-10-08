'use client';

/**
 * The replacement rate shop's two halves: the pinned filter bar (carrier chips
 * with counts, sort, built-in coverage) and the rate rows it narrows. The host
 * owns the filter state; {@link shopRates} applies it.
 */

import { Clock, ShieldCheck, Truck } from '@/components/Icons';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_OUTLINE_CLASS } from '@/design-system/components/record-card/record-card-outline';
import { formatMoney } from '@/lib/shipping/label-rate-choice';
import {
  includedCoverageUsd,
  rateArrival,
  rateTotal,
  type CoverageFilter,
  type RateSort,
} from '@/lib/shipping/replacement-rate-shop';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { formatDateKeyMedium } from '@/utils/date';
import { cn } from '@/utils/_cn';

const SORT_TABS: { id: RateSort; label: string }[] = [
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'priciest', label: 'Most expensive' },
  { id: 'fastest', label: 'Fastest' },
];

const COVERAGE_TABS: { id: CoverageFilter; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'includes_coverage', label: 'Includes coverage' },
  { id: 'no_coverage', label: 'No coverage' },
];

/** The row grid, shared by the column header and every rate row so the columns line up. */
const RATE_GRID = 'grid grid-cols-12 items-center gap-3';

export function ReplacementRateFilters({
  facets,
  carriers,
  onCarriersChange,
  sort,
  onSortChange,
  coverage,
  onCoverageChange,
}: {
  facets: readonly { key: string; label: string; count: number }[];
  carriers: ReadonlySet<string>;
  onCarriersChange: (next: ReadonlySet<string>) => void;
  sort: RateSort;
  onSortChange: (next: RateSort) => void;
  coverage: CoverageFilter;
  onCoverageChange: (next: CoverageFilter) => void;
}) {
  const total = facets.reduce((sum, facet) => sum + facet.count, 0);
  const toggle = (key: string) => {
    const next = new Set(carriers);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onCarriersChange(next);
  };
  return (
    <div className="flex flex-col gap-2" data-testid="send-replacement-rate-filters">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Carriers">
        <Button
          variant={carriers.size === 0 ? 'primarySoft' : 'secondary'}
          size="sm"
          radius="pill"
          aria-pressed={carriers.size === 0}
          onClick={() => onCarriersChange(new Set())}
          data-testid="send-replacement-carrier-all"
        >
          All · {total}
        </Button>
        {facets.map((facet) => {
          const pressed = carriers.has(facet.key);
          return (
            <Button
              key={facet.key}
              variant={pressed ? 'primarySoft' : 'secondary'}
              size="sm"
              radius="pill"
              aria-pressed={pressed}
              onClick={() => toggle(facet.key)}
              data-testid={`send-replacement-carrier-${facet.key}`}
            >
              {facet.label} · {facet.count}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <TabSwitch
          tabs={SORT_TABS}
          activeTab={sort}
          onTabChange={(id) => {
            const next = SORT_TABS.find((tab) => tab.id === id);
            if (next) onSortChange(next.id);
          }}
          size="sm"
          fit="hug"
        />
        <TabSwitch
          tabs={COVERAGE_TABS}
          activeTab={coverage}
          onTabChange={(id) => {
            const next = COVERAGE_TABS.find((tab) => tab.id === id);
            if (next) onCoverageChange(next.id);
          }}
          size="sm"
          fit="hug"
        />
      </div>
      <div className={cn(RATE_GRID, 'px-3 mode-label text-text-muted')} aria-hidden>
        <span className="col-span-4">Carrier · service</span>
        <span className="col-span-2">Arrives</span>
        <span className="col-span-2 text-right">Insurance</span>
        <span className="col-span-2">Coverage</span>
        <span className="col-span-2 text-right">Total</span>
      </div>
    </div>
  );
}

/** Transit time as the carrier gave it: whole days, else its own free-text estimate. */
function transitText(rate: ShippingRateOption): string {
  if (typeof rate.deliveryDays === 'number' && rate.deliveryDays > 0) {
    return `${rate.deliveryDays} day${rate.deliveryDays === 1 ? '' : 's'}`;
  }
  return rate.carrierDeliveryDays ? `${rate.carrierDeliveryDays} days` : '—';
}

export function ReplacementRateRows({
  rates,
  returnedCount,
  invalidCount,
  selectedRateId,
  onSelect,
  insured,
  disabled,
}: {
  /** Already narrowed and sorted by the filter bar. */
  rates: readonly ShippingRateOption[];
  /** Rates the quote returned before filtering — tells "none came back" from "filtered away". */
  returnedCount: number;
  /** Carrier services that could not rate this parcel. */
  invalidCount: number;
  selectedRateId: string | null;
  onSelect: (rateId: string) => void;
  /** A declared value went with the request — an absent insurance price reads "not quoted", not "free". */
  insured: boolean;
  disabled: boolean;
}) {
  const now = new Date();
  const invalidNote =
    invalidCount > 0 ? (
      <p className="text-role-caption text-text-faint">
        {invalidCount} carrier service{invalidCount === 1 ? '' : 's'} couldn&rsquo;t rate this parcel.
      </p>
    ) : null;
  if (rates.length === 0) {
    return (
      <>
        <p className="rounded-mode-control border border-dashed border-border-soft px-3 py-4 text-center text-role-caption text-text-soft">
          {returnedCount === 0 ? 'No rates returned for this parcel.' : 'No rate matches these filters.'}
        </p>
        {invalidNote}
      </>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-1" role="radiogroup" aria-label="Rates" data-testid="send-replacement-rates">
        {rates.map((rate) => {
          const selected = rate.rateId === selectedRateId;
          const arrival = rateArrival(rate, now);
          const coverageUsd = includedCoverageUsd(rate);
          return (
            <li key={rate.rateId}>
              <button /* ds-raw-button: a selectable multi-column rate row (radio), not a verb */
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onSelect(rate.rateId)}
                data-testid="send-replacement-rate-row"
                className={cn(
                  RATE_GRID,
                  'relative w-full rounded-mode-control px-3 py-2 text-left transition-colors disabled:opacity-60',
                  selected ? 'bg-surface-accent' : 'hover:bg-surface-hover',
                  focusRing('control'),
                )}
              >
                <span className="col-span-4 flex min-w-0 items-center gap-2">
                  <Truck className={cn('h-4 w-4 shrink-0', selected ? 'text-text-accent' : 'text-text-faint')} />
                  <span className="min-w-0">
                    <span className="block truncate text-role-caption font-semibold text-text-default">{rate.carrierName}</span>
                    <span className="block truncate text-role-micro text-text-soft">{rate.serviceName}</span>
                  </span>
                </span>
                <span className="col-span-2 min-w-0">
                  <span className="flex items-center gap-1 text-role-caption text-text-default">
                    <Clock className="h-3 w-3 shrink-0 text-text-faint" />
                    {transitText(rate)}
                  </span>
                  <span className="block truncate text-role-micro text-text-soft">
                    {arrival ? formatDateKeyMedium(arrival) : '—'}
                  </span>
                </span>
                <span className="col-span-2 text-right text-role-caption tabular-nums text-text-soft">
                  {rate.insuranceAmount != null
                    ? formatMoney(rate.insuranceAmount, rate.currency)
                    : insured
                      ? 'Not quoted'
                      : '—'}
                </span>
                <span className="col-span-2 min-w-0">
                  {coverageUsd != null ? (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-mode-pill bg-surface-success px-2 py-0.5 text-role-micro font-medium text-text-success ring-1 ring-inset ring-border-success">
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                      <span className="truncate">{formatMoney(coverageUsd, 'USD')} coverage</span>
                    </span>
                  ) : null}
                </span>
                <span className="col-span-2 text-right text-role-caption font-semibold tabular-nums text-text-default">
                  {formatMoney(rateTotal(rate), rate.currency)}
                </span>
                <span aria-hidden className={cn(STATE_OUTLINE_CLASS, selected ? 'border-border-accent' : null)} />
              </button>
            </li>
          );
        })}
      </ul>
      {invalidNote}
    </>
  );
}
