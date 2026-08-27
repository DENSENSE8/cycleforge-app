'use client';

/**
 * Zone 2 of `/search?sel=unit:` — the serial unit centre.
 *
 * Top to bottom, and it is a contract:
 *   1. Unit identity — pinned by `EntityStationPane` as a flex sibling above
 *      the scrollport, not `position: sticky`.
 *   2. Facts — the four things that identify a unit to an operator and which
 *      the identity BAR has no slot for: SKU, grade, status, location.
 *
 * Preview search does not mount a warehouse thread.
 *
 * **This is where the identity VM's `lifecycle` half is consumed.**
 * `unitLifecycleFace` resolves a raw `current_status` through the unit-status
 * SoT (dot + pill + label) and shows an unknown status VERBATIM rather than
 * swallowing it into "Unknown".
 *
 * **No grade / hold controls.** Preview is the ABSENCE of the capability, never
 * a fork with the editors deleted: `UnitDetailsPanel` (the inventory overlay,
 * a WORK surface) still owns `GradeActionCard` and `HoldActionCard`.
 *
 * **Zero padding here** — `StationWorkbench` owns the column pad; rhythm is
 * flex `gap`.
 */

import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import { StationCollapsibleBlock } from '@/components/station/collapse';
import type { AutoCollapseController } from '@/components/station/collapse';
import type { UnitStationIdentityVM } from '@/components/station/unit';
import { GridStatusCellValue } from '@/components/ui/grid-cells';

export function SearchUnitCentre({
  unitId,
  vm,
  collapse,
}: {
  unitId: number;
  vm: UnitStationIdentityVM;
  /** Shared controller — blocks collapse on ONE signal, not per-block state. */
  collapse: AutoCollapseController;
}) {
  void unitId;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <StationCollapsibleBlock
        label="Unit"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-unit-facts-block"
      >
        <OrderFactList cols={2}>
          <OrderFactRow label="SKU" value={vm.sku} mono omitWhenEmpty />
          <OrderFactRow label="Product" value={vm.productTitle} span omitWhenEmpty />
          <OrderFactRow
            label="Status"
            value={
              vm.lifecycle ? (
                <GridStatusCellValue
                  label={vm.lifecycle.label}
                  toneClass={vm.lifecycle.pillClass}
                  dotClass={vm.lifecycle.dotClass}
                  tooltip={vm.lifecycle.tip}
                />
              ) : null
            }
          />
          <OrderFactRow label="Grade" value={vm.conditionText} />
          <OrderFactRow label="Location" value={vm.location} mono omitWhenEmpty />
        </OrderFactList>
      </StationCollapsibleBlock>
    </div>
  );
}
