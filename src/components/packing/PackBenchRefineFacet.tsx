'use client';

/**
 * Packing-bench row facet — rides IN the find field on Ready to Pack and To-ship.
 *
 * @domain-job packing-bench-row-facet
 * @hardware-target Workbench
 * @density ops
 * @justification Ready to Pack and To-ship share one find-field bench filter (`?packStation=` / `?packPlaced=`). A KPI-band chip row is the retired twin; this grows the To-ship SoT instead of forking a second menu.
 *
 * House law (`band3-find-only`): a facet that filters rows sits in
 * `trailingSuffix` beside the query it refines. Not a KPI-band chip row, and
 * not a Views-menu occupant. `packStation` is a saved-view param on To-ship, so
 * a view remembers the bench rather than hosting the control.
 *
 * Counts come from `queue-counts.packPlacement` (order ledger). Every bench
 * renders, including empty ones — spatial predictability.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useToShipFilterActions } from '@/components/dashboard/OutboundFilterStrip';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { PackageCheck } from '@/components/Icons';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';

export function PackBenchRefineFacet() {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const { data } = useQuery(unshippedQueueCountsQuery({ staffId }));
  const { packStationId, packPlacedOnly, togglePackStation, togglePackPlaced, clearPackPlacement } =
    useToShipFilterActions();

  const benches = data?.packPlacement?.counts ?? [];
  if (benches.length === 0) return null;

  const activeBench = benches.find((b) => b.locationId === packStationId) ?? null;
  const hot = Boolean(packStationId || packPlacedOnly);
  const hotLabel = activeBench
    ? packBenchShortLabel(activeBench)
    : packPlacedOnly
      ? 'At a bench'
      : undefined;

  return (
    <WorkbenchFilterPopover
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      hotActiveLabel={hotLabel}
      label="Filter by packing bench"
      density="field"
      icon={<PackageCheck className="h-3.5 w-3.5" aria-hidden />}
    >
      <WorkbenchFilterGroupLabel>Packing bench</WorkbenchFilterGroupLabel>
      <WorkbenchFilterMenuRow
        label="Any bench"
        active={!packStationId && !packPlacedOnly}
        onClick={() => {
          clearPackPlacement();
          setOpen(false);
        }}
      />
      <WorkbenchFilterMenuRow
        label="At a bench"
        count={data?.packPlacement?.totalPlaced ?? 0}
        active={packPlacedOnly}
        onClick={() => {
          togglePackPlaced();
          setOpen(false);
        }}
      />
      <WorkbenchFilterDivider />
      {benches.map((bench) => (
        <WorkbenchFilterMenuRow
          key={bench.locationId}
          label={packBenchShortLabel(bench)}
          count={bench.count}
          active={packStationId === bench.locationId}
          onClick={() => {
            togglePackStation(bench.locationId);
            setOpen(false);
          }}
        />
      ))}
    </WorkbenchFilterPopover>
  );
}
