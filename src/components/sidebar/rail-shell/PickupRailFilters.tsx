'use client';

/**
 * Field-density facet popover for Local Pickup recent rail — order status.
 * Same grammar as other recent-rail footers.
 */

import {
  FilterMenu,
  FilterMenuRow,
} from '@/design-system/primitives/FilterMenu';
import { useState } from 'react';
import {
  pickupOrderIsDone,
  pickupOrderNeedsProcess,
} from '@/lib/local-pickup/order-status';
import type { PickupOrderGroup } from '@/components/receiving/pickup/pickup-lines';

export type PickupRailStatusFacet = 'process' | 'draft' | 'done';

export interface PickupRailFacets {
  status: PickupRailStatusFacet | null;
}

export const EMPTY_PICKUP_RAIL_FACETS: PickupRailFacets = {
  status: null,
};

const STATUS_OPTIONS: Array<{ id: PickupRailStatusFacet; label: string }> = [
  { id: 'process', label: 'Need to process' },
  { id: 'draft', label: 'Draft' },
  { id: 'done', label: 'Done' },
];

function pickupRailFacetsHot(facets: PickupRailFacets): boolean {
  return facets.status != null;
}

function pickupRailFacetsHotLabel(facets: PickupRailFacets): string | undefined {
  return STATUS_OPTIONS.find((o) => o.id === facets.status)?.label;
}

export function matchesPickupRailFacets(
  group: PickupOrderGroup,
  facets: PickupRailFacets,
): boolean {
  if (facets.status == null) return true;
  const needsProcess = pickupOrderNeedsProcess({
    status: group.orderStatus,
    receivingId: group.receivingId,
    itemCount: group.itemCount,
  });
  const done = pickupOrderIsDone(group.orderStatus);
  if (facets.status === 'process') return needsProcess;
  if (facets.status === 'done') return done;
  return !done;
}

export function PickupRailFilters({
  facets,
  onChange,
}: {
  facets: PickupRailFacets;
  onChange: (next: PickupRailFacets) => void;
}) {
  const [open, setOpen] = useState(false);
  const hot = pickupRailFacetsHot(facets);
  const hotLabel = pickupRailFacetsHotLabel(facets);

  return (
    <FilterMenu
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Rail filters"
      contentClassName="w-56"
    >
      <FilterMenuRow
        label="All statuses"
        active={facets.status == null}
        sectionHeader
        onClick={() => {
          onChange({ ...facets, status: null });
          setOpen(false);
        }}
      />
      {STATUS_OPTIONS.map((opt) => (
        <FilterMenuRow
          key={opt.id}
          label={opt.label}
          active={facets.status === opt.id}
          onClick={() => {
            onChange({ ...facets, status: opt.id });
            setOpen(false);
          }}
        />
      ))}
    </FilterMenu>
  );
}
