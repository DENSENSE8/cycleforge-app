'use client';

/**
 * Field-density facet popover for ReceivingLineRow recent-rail footers —
 * Priority · Type · Platform (Unbox · Triage · Testing). Composes
 * {@link WorkbenchFilterPopover}; seats in TechRailSearchBar `trailingSuffix`
 * (after hover-reveal paste). Local state only (not workbench URL facets).
 *
 * Preferred import: {@link ReceivingRecentRailFilters} from
 * `@/components/sidebar/rail-shell/ReceivingRecentRailFilters`.
 */

import { useState } from 'react';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { ReceivingTypeMark } from '@/components/ui/ReceivingTypeMark';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import { PRIORITY_OVERRIDE_TIERS } from '@/lib/receiving/priority-override';
import {
  EMPTY_UNBOX_RAIL_FACETS,
  unboxRailFacetsHot,
  unboxRailFacetsHotLabel,
  type UnboxRailFacets,
} from '@/lib/receiving/rail/unbox-rail-facets';

export function UnboxRecentRailFilters({
  facets,
  onChange,
}: {
  facets: UnboxRailFacets;
  onChange: (next: UnboxRailFacets) => void;
}) {
  const [open, setOpen] = useState(false);
  const { options: platformOptions } = usePlatformCatalog();
  const { options: typeOptions } = useReceivingTypeCatalog();
  const hot = unboxRailFacetsHot(facets);
  const hotLabel = unboxRailFacetsHotLabel(facets);

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
      <WorkbenchFilterGroupLabel>Priority</WorkbenchFilterGroupLabel>
      <WorkbenchFilterMenuRow
        label="All priorities"
        active={facets.priorityTier == null}
        onClick={() => {
          onChange({ ...facets, priorityTier: null });
          setOpen(false);
        }}
      />
      {PRIORITY_OVERRIDE_TIERS.map((tier) => (
        <WorkbenchFilterMenuRow
          key={tier.value}
          label={tier.label}
          active={facets.priorityTier === tier.value}
          onClick={() => {
            onChange({ ...facets, priorityTier: tier.value });
            setOpen(false);
          }}
        />
      ))}

      <WorkbenchFilterDivider />
      <WorkbenchFilterMenuRow
        label="All types"
        active={facets.receivingType == null}
        sectionHeader
        onClick={() => {
          onChange({ ...facets, receivingType: null });
          setOpen(false);
        }}
      />
      {typeOptions.map((opt) => (
        <WorkbenchFilterMenuRow
          key={opt.value}
          label={opt.label}
          active={facets.receivingType === opt.value}
          leading={<ReceivingTypeMark typeValue={opt.value} textClassName="text-current" />}
          onClick={() => {
            onChange({ ...facets, receivingType: opt.value });
            setOpen(false);
          }}
        />
      ))}

      <WorkbenchFilterDivider />
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

      {hot ? (
        <>
          <WorkbenchFilterDivider />
          <WorkbenchFilterMenuRow
            label="Clear filters"
            active={false}
            onClick={() => {
              onChange(EMPTY_UNBOX_RAIL_FACETS);
              setOpen(false);
            }}
          />
        </>
      ) : null}
    </WorkbenchFilterPopover>
  );
}
