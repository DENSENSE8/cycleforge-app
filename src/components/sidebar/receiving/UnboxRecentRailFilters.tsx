'use client';

/**
 * Field-density facet popover for ReceivingLineRow recent-rail footers —
 * Priority · Type · Platform (Unbox · Triage · Testing). Composes
 * {@link FilterMenu}; seats in TechRailSearchBar `trailingSuffix`
 * (after hover-reveal paste). Local state only (not workbench URL facets).
 *
 * Preferred import: {@link ReceivingRecentRailFilters} from
 * `@/components/sidebar/rail-shell/ReceivingRecentRailFilters`.
 */

import { useState } from 'react';
import {
  FilterMenuDivider,
  FilterMenuGroupLabel,
  FilterMenuRow,
  FilterMenu,
} from '@/components/ui/FilterMenu';
import { MenuBrandIdentity } from '@/components/ui/grid-cells';
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
    <FilterMenu
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Rail filters"
      hotActiveLabel={hotLabel}
      contentClassName="w-56"
    >
      <FilterMenuGroupLabel>Priority</FilterMenuGroupLabel>
      <FilterMenuRow
        label="All priorities"
        active={facets.priorityTier == null}
        onClick={() => {
          onChange({ ...facets, priorityTier: null });
          setOpen(false);
        }}
      />
      {PRIORITY_OVERRIDE_TIERS.map((tier) => (
        <FilterMenuRow
          key={tier.value}
          label={tier.label}
          active={facets.priorityTier === tier.value}
          onClick={() => {
            onChange({ ...facets, priorityTier: tier.value });
            setOpen(false);
          }}
        />
      ))}

      <FilterMenuDivider />
      <FilterMenuRow
        label="All types"
        active={facets.receivingType == null}
        sectionHeader
        onClick={() => {
          onChange({ ...facets, receivingType: null });
          setOpen(false);
        }}
      />
      {typeOptions.map((opt) => (
        <FilterMenuRow
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

      <FilterMenuDivider />
      <FilterMenuRow
        label="All platforms"
        active={facets.platform == null}
        sectionHeader
        onClick={() => {
          onChange({ ...facets, platform: null });
          setOpen(false);
        }}
      />
      {platformOptions.map((opt) => (
        <FilterMenuRow
          key={opt.value}
          label={opt.label}
          active={facets.platform === opt.value}
          leading={<MenuBrandIdentity kind="platform" label={opt.label} value={opt.value} />}
          onClick={() => {
            onChange({ ...facets, platform: opt.value });
            setOpen(false);
          }}
        />
      ))}

      {hot ? (
        <>
          <FilterMenuDivider />
          <FilterMenuRow
            label="Clear filters"
            active={false}
            onClick={() => {
              onChange(EMPTY_UNBOX_RAIL_FACETS);
              setOpen(false);
            }}
          />
        </>
      ) : null}
    </FilterMenu>
  );
}
