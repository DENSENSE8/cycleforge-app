'use client';

/**
 * Field-density facet popover for Pack / Scan-out history rails —
 * Platform (account_source). Same WorkbenchFilterPopover grammar as
 * {@link ReceivingRecentRailFilters}; seats in TechRailSearchBar trailingSuffix.
 */

import { useState } from 'react';
import {
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { sourcePlatformLabel } from '@/lib/source-platform';

export interface StationHistoryRailFacets {
  /** Lowercase account_source / platform; null = all. */
  platform: string | null;
}

export const EMPTY_STATION_HISTORY_RAIL_FACETS: StationHistoryRailFacets = {
  platform: null,
};

function stationHistoryRailFacetsHot(facets: StationHistoryRailFacets): boolean {
  return facets.platform != null;
}

function stationHistoryRailFacetsHotLabel(
  facets: StationHistoryRailFacets,
): string | undefined {
  return facets.platform ? sourcePlatformLabel(facets.platform) : undefined;
}

export function matchesStationHistoryRailFacets(
  accountSource: string | null | undefined,
  facets: StationHistoryRailFacets,
): boolean {
  if (facets.platform == null) return true;
  return (accountSource || '').trim().toLowerCase() === facets.platform;
}

export function StationHistoryRailFilters({
  facets,
  onChange,
}: {
  facets: StationHistoryRailFacets;
  onChange: (next: StationHistoryRailFacets) => void;
}) {
  const [open, setOpen] = useState(false);
  const { options: platformOptions } = usePlatformCatalog();
  const hot = stationHistoryRailFacetsHot(facets);
  const hotLabel = stationHistoryRailFacetsHotLabel(facets);

  return (
    <WorkbenchFilterPopover
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Rail filters"
      hotActiveLabel={hotLabel}
      density="field"
      contentClassName="w-56"
    >
      <WorkbenchFilterMenuRow
        label="All platforms"
        active={facets.platform == null}
        sectionHeader
        onClick={() => {
          onChange({ ...facets, platform: null });
          setOpen(false);
        }}
      />
      {platformOptions.map((opt) => (
        <WorkbenchFilterMenuRow
          key={opt.value}
          label={opt.label}
          active={facets.platform === opt.value}
          leading={
            <PlatformMark platformValue={opt.value} preferBrandTile textClassName="text-current" />
          }
          onClick={() => {
            onChange({ ...facets, platform: opt.value });
            setOpen(false);
          }}
        />
      ))}
    </WorkbenchFilterPopover>
  );
}
