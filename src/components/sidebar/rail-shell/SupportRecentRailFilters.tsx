'use client';

/**
 * Field-density facet popover for Support Tickets recent dock —
 * Status · Priority. Same grammar as receiving/station history rail filters.
 */

import {
  FilterMenu,
  FilterMenuDivider,
  FilterMenuRow,
} from '@/design-system/primitives/FilterMenu';
import { useState } from 'react';
import type { RecentTicket } from '@/hooks/useRecentTickets';

export interface SupportRecentRailFacets {
  status: string | null;
  priority: string | null;
}

export const EMPTY_SUPPORT_RECENT_RAIL_FACETS: SupportRecentRailFacets = {
  status: null,
  priority: null,
};

const STATUS_OPTIONS = ['new', 'open', 'pending', 'hold', 'solved', 'closed'] as const;
const PRIORITY_OPTIONS = ['urgent', 'high', 'normal', 'low'] as const;

function supportRecentRailFacetsHot(facets: SupportRecentRailFacets): boolean {
  return facets.status != null || facets.priority != null;
}

function supportRecentRailFacetsHotLabel(
  facets: SupportRecentRailFacets,
): string | undefined {
  const parts = [facets.status, facets.priority].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : undefined;
}

export function matchesSupportRecentRailFacets(
  ticket: RecentTicket,
  facets: SupportRecentRailFacets,
): boolean {
  if (facets.status != null) {
    if ((ticket.status || '').trim().toLowerCase() !== facets.status) return false;
  }
  if (facets.priority != null) {
    if ((ticket.priority || '').trim().toLowerCase() !== facets.priority) return false;
  }
  return true;
}

export function SupportRecentRailFilters({
  facets,
  onChange,
}: {
  facets: SupportRecentRailFacets;
  onChange: (next: SupportRecentRailFacets) => void;
}) {
  const [open, setOpen] = useState(false);
  const hot = supportRecentRailFacetsHot(facets);
  const hotLabel = supportRecentRailFacetsHotLabel(facets);

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
      {STATUS_OPTIONS.map((status) => (
        <FilterMenuRow
          key={status}
          label={status}
          active={facets.status === status}
          onClick={() => {
            onChange({ ...facets, status });
            setOpen(false);
          }}
        />
      ))}

      <FilterMenuDivider />
      <FilterMenuRow
        label="All priorities"
        active={facets.priority == null}
        sectionHeader
        onClick={() => {
          onChange({ ...facets, priority: null });
          setOpen(false);
        }}
      />
      {PRIORITY_OPTIONS.map((priority) => (
        <FilterMenuRow
          key={priority}
          label={priority}
          active={facets.priority === priority}
          onClick={() => {
            onChange({ ...facets, priority });
            setOpen(false);
          }}
        />
      ))}
    </FilterMenu>
  );
}
