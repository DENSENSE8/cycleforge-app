'use client';

/**
 * Field-density facet popover for Product Labels Printed recent rail —
 * unit status. Same grammar as other recent-rail footers.
 */

import { useState } from 'react';
import {
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import type { LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';

export interface LabelPrintRailFacets {
  status: string | null;
}

export const EMPTY_LABEL_PRINT_RAIL_FACETS: LabelPrintRailFacets = {
  status: null,
};

/** Common serial-unit statuses shown in the Printed rail filter. */
const STATUS_OPTIONS = [
  'RECEIVED',
  'IN_TEST',
  'PASSED',
  'FAILED',
  'PACKED',
  'SHIPPED',
] as const;

function labelPrintRailFacetsHot(facets: LabelPrintRailFacets): boolean {
  return facets.status != null;
}

function labelPrintRailFacetsHotLabel(
  facets: LabelPrintRailFacets,
): string | undefined {
  return facets.status ?? undefined;
}

export function matchesLabelPrintRailFacets(
  item: LabelPrintFeedItem,
  facets: LabelPrintRailFacets,
): boolean {
  if (facets.status == null) return true;
  return (item.current_status || '').trim().toUpperCase() === facets.status;
}

export function LabelPrintRailFilters({
  facets,
  onChange,
}: {
  facets: LabelPrintRailFacets;
  onChange: (next: LabelPrintRailFacets) => void;
}) {
  const [open, setOpen] = useState(false);
  const hot = labelPrintRailFacetsHot(facets);
  const hotLabel = labelPrintRailFacetsHotLabel(facets);

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
        label="All statuses"
        active={facets.status == null}
        sectionHeader
        onClick={() => {
          onChange({ ...facets, status: null });
          setOpen(false);
        }}
      />
      {STATUS_OPTIONS.map((status) => (
        <WorkbenchFilterMenuRow
          key={status}
          label={status}
          active={facets.status === status}
          onClick={() => {
            onChange({ ...facets, status });
            setOpen(false);
          }}
        />
      ))}
    </WorkbenchFilterPopover>
  );
}
