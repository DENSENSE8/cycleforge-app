'use client';

/**
 * The label-buy Rate step: carrier chips, sort and coverage pinned on top,
 * the rate rows under them owning every remaining pixel — the one scroll area
 * (operator 2026-10-08: "I cannot see the selection items for the labels").
 * {@link useRateShop} is the shop's state; the form narrows with `shopRates`.
 */

import { useState } from 'react';
import { ScrollPane } from '@/design-system/primitives';
import { carrierFacets, type CoverageFilter, type RateSort } from '@/lib/shipping/replacement-rate-shop';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { ReplacementRateFilters, ReplacementRateRows } from './ReplacementRateTable';

/** The rate shop's filters (carrier chips, sort, coverage) and the picked rate. */
export interface RateShop {
  carriers: ReadonlySet<string>;
  setCarriers: (next: ReadonlySet<string>) => void;
  sort: RateSort;
  setSort: (next: RateSort) => void;
  coverage: CoverageFilter;
  setCoverage: (next: CoverageFilter) => void;
  selectedRateId: string | null;
  setSelectedRateId: (next: string | null) => void;
}

export function useRateShop(): RateShop {
  const [carriers, setCarriers] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<RateSort>('cheapest');
  const [coverage, setCoverage] = useState<CoverageFilter>('any');
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  return { carriers, setCarriers, sort, setSort, coverage, setCoverage, selectedRateId, setSelectedRateId };
}

export function LabelBuyRateStep({
  shop,
  rates,
  visibleRates,
  invalidCount,
  insured,
  disabled,
}: {
  shop: RateShop;
  /** Every rate the quote returned. */
  rates: readonly ShippingRateOption[];
  /** `rates` narrowed and sorted by the shop. */
  visibleRates: readonly ShippingRateOption[];
  invalidCount: number;
  insured: boolean;
  disabled: boolean;
}) {
  return (
    <>
      <div className="shrink-0 border-t border-border-hairline px-5 pb-2 pt-3">
        <ReplacementRateFilters
          facets={carrierFacets(rates)}
          carriers={shop.carriers}
          onCarriersChange={shop.setCarriers}
          sort={shop.sort}
          onSortChange={shop.setSort}
          coverage={shop.coverage}
          onCoverageChange={shop.setCoverage}
        />
      </div>
      <ScrollPane className="flex flex-col gap-2 px-5 pb-3">
        <ReplacementRateRows
          rates={visibleRates}
          returnedCount={rates.length}
          invalidCount={invalidCount}
          selectedRateId={shop.selectedRateId}
          onSelect={shop.setSelectedRateId}
          insured={insured}
          disabled={disabled}
        />
      </ScrollPane>
    </>
  );
}
