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
import { useToShipFilterActions } from '@/components/dashboard/OutboundFilterStrip';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import type { UnshippedQueueCounts } from '@/lib/orders/queue-counts-normalize';

/**
 * The bench tallies are ORG-scoped, not staff-scoped: the route builds them from
 * `countOpenPlacementsByLocation(orgId)`, which never sees `?staff=` — only
 * total / byStage / urgent / combos take the staff clause. So this facet rides
 * the CANONICAL unscoped counts key (`{ staffId: null }`) — the one BOTH RSC
 * seeds dehydrate (`unshipped-queue-seed.server.ts`,
 * `ready-to-pack-shell-seed.server.ts`) and every other To-ship / Ready-to-Pack
 * consumer already shares — and narrows to the placement slice with `select`.
 *
 * It used to key on `?staff=`, which forked a SECOND ~15s
 * `/api/orders/queue-counts` request (its own Upstash entry too — `staff` is
 * part of `createCacheLookupKey`) for a payload slice that is byte-identical
 * across every staff id, and missed the seed so the benches stayed invisible
 * until it settled. `select` keeps the key shared (so react-query dedupes)
 * while re-rendering this popover only when the placement slice moves.
 */
const selectPackPlacement = (counts: UnshippedQueueCounts) => counts.packPlacement;

export function PackBenchRefineFacet() {
  const [open, setOpen] = useState(false);
  const { data: placement } = useQuery({
    ...unshippedQueueCountsQuery(),
    select: selectPackPlacement,
  });
  const { packStationId, packPlacedOnly, togglePackStation, togglePackPlaced, clearPackPlacement } =
    useToShipFilterActions();

  const benches = placement?.counts ?? [];
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
        count={placement?.totalPlaced ?? 0}
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
