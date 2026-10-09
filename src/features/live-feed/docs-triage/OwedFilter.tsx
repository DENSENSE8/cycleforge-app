'use client';

/**
 * The docs sheet's owed filter — every order, orders owing anything, or
 * orders owing one tab — each option with how many orders it shows (operator
 * 2026-10-09: "filter to items without documents"). One control for the rail
 * and the grid; `F` cycles it. It lives in the sheet, not the page sidebar:
 * the sheet is a modal over the Live feed and its orders are its own list.
 */

import { FilterDropdownSelect } from '@/design-system/components/FilterDropdownSelect';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { DOC_TAB_LABEL, DOC_TABS } from './doc-tabs';
import { isRailFilter, railFilterCounts, type RailFilter } from './sheet-model';

export const RAIL_FILTER_LABEL: Readonly<Record<RailFilter, string>> = {
  all: 'Every order',
  owed: 'Owing anything',
  label: `Owing ${DOC_TAB_LABEL.label.toLowerCase()}`,
  slip: `Owing ${DOC_TAB_LABEL.slip.toLowerCase()}`,
  paperwork: `Owing ${DOC_TAB_LABEL.paperwork.toLowerCase()}`,
};

export function OwedFilter({
  rows,
  value,
  onChange,
}: {
  /** Every order of the selection — the counts read them. */
  rows: readonly OrderPacket[];
  value: RailFilter;
  onChange: (next: RailFilter) => void;
}) {
  const counts = railFilterCounts(rows);
  return (
    <FilterDropdownSelect
      label="Show"
      value={value === 'all' ? null : value}
      onChange={(next) => onChange(isRailFilter(next) ? next : 'all')}
      options={(['owed', ...DOC_TABS] as const).map((filter) => ({ value: filter, label: `${RAIL_FILTER_LABEL[filter]} (${counts[filter]})` }))}
      emptyOption={{ value: '', label: `${RAIL_FILTER_LABEL.all} (${counts.all})` }}
      ariaLabel="Show orders"
    />
  );
}
