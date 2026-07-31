'use client';

/**
 * Store order-scope filter — All orders vs Repair (-RS).
 *
 * Lives in the SearchField trailing cluster (`trailingPrefix`, left of paste)
 * via {@link WorkbenchFilterPopover} `density="field"`. Replaces the old
 * HorizontalButtonSlider tab row under the search field.
 *
 * When scope ≠ `all`, callers also render {@link WorkbenchFilterHotChip}
 * beside the SearchField (floor glanceability — D1/D10).
 */

import { useState } from 'react';
import { ShoppingCart, Wrench } from '@/components/Icons';
import {
  WorkbenchFilterGroupLabel,
  WorkbenchFilterHotChip,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import type { EcwidOrderScope } from './ecwid-search-shared';
import type { EcwidProductSearchController } from './useEcwidProductSearch';

const SCOPE_OPTIONS: Array<{
  id: EcwidOrderScope;
  label: string;
  icon: typeof ShoppingCart;
}> = [
  { id: 'all', label: 'All orders', icon: ShoppingCart },
  { id: 'repair_rs', label: 'Repair', icon: Wrench },
];

/** Field-density scope filter for the Store search bar trailing slot. */
export function EcwidOrderScopeFilters({ c }: { c: EcwidProductSearchController }) {
  const [open, setOpen] = useState(false);
  if (c.popoverMode !== 'repair_service') return null;

  const hot = c.orderScope !== 'all';
  const hotLabel = hot
    ? (SCOPE_OPTIONS.find((o) => o.id === c.orderScope)?.label ?? 'Filter')
    : undefined;

  return (
    <WorkbenchFilterPopover
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Order scope"
      hotActiveLabel={hotLabel}
      density="field"
      contentClassName="w-48"
    >
      <WorkbenchFilterGroupLabel>Scope</WorkbenchFilterGroupLabel>
      {SCOPE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <WorkbenchFilterMenuRow
            key={opt.id}
            label={opt.label}
            active={c.orderScope === opt.id}
            leading={<Icon className="h-3.5 w-3.5 shrink-0 text-text-faint" />}
            onClick={() => {
              c.setOrderScope(opt.id);
              setOpen(false);
            }}
          />
        );
      })}
    </WorkbenchFilterPopover>
  );
}

/** Clearable “Repair” (etc.) chip shown beside the Store SearchField when hot. */
export function EcwidOrderScopeHotChip({ c }: { c: EcwidProductSearchController }) {
  if (c.popoverMode !== 'repair_service' || c.orderScope === 'all') return null;
  const label = SCOPE_OPTIONS.find((o) => o.id === c.orderScope)?.label ?? 'Filter';
  return (
    <WorkbenchFilterHotChip
      label={label}
      onClear={() => c.setOrderScope('all')}
    />
  );
}
