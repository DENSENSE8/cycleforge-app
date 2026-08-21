'use client';

/**
 * Zone 2 of `/search?sel=unit:` — the serial unit centre.
 *
 * Top to bottom, and it is a contract:
 *   1. Unit identity — pinned by `EntityStationPane` as a flex sibling above
 *      the scrollport, not `position: sticky`.
 *   2. Facts — the four things that identify a unit to an operator and which
 *      the identity BAR has no slot for: SKU, grade, status, location.
 *   3. The unit's warehouse thread.
 *
 * **This is where the identity VM's `lifecycle` half is consumed.**
 * `unitLifecycleFace` resolves a raw `current_status` through the unit-status
 * SoT (dot + pill + label) and shows an unknown status VERBATIM rather than
 * swallowing it into "Unknown". It used to target `CartonContextCard.lifecycle`,
 * a prop deleted on 2026-08-21 when the chip came off the identity strip — so
 * the resolved face lands on a fact row here instead. Same SoT, different seat.
 *
 * **No grade / hold controls.** Preview is the ABSENCE of the capability, never
 * a fork with the editors deleted: `UnitDetailsPanel` (the inventory overlay,
 * a WORK surface) still owns `GradeActionCard` and `HoldActionCard`. Grading a
 * unit from a find surface has no station context behind it, which is the same
 * reason the order centre omits `editableShippingFields`.
 *
 * **Zero padding here** — `StationWorkbench` owns the column pad, `ThreadPanel`
 * owns its own insets, rhythm is flex `gap` (never `space-y-*`, which loses to
 * `mb-auto` on a bottom-pinned body).
 */

import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { StationCollapsibleBlock } from '@/components/station/collapse';
import type { AutoCollapseController } from '@/components/station/collapse';
import type { UnitStationIdentityVM } from '@/components/station/unit';
import { cn } from '@/utils/_cn';

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
  const hasUnitRow = Number.isFinite(unitId) && unitId > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 2 · FACTS */}
      <StationCollapsibleBlock
        label="Unit"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-unit-facts-block"
        bodyClassName="pt-1"
      >
        <OrderFactList cols={2}>
          <OrderFactRow label="SKU" value={vm.sku} mono omitWhenEmpty />
          <OrderFactRow label="Product" value={vm.productTitle} span omitWhenEmpty />
          <OrderFactRow
            label="Status"
            value={
              vm.lifecycle ? (
                <span className="inline-flex items-center gap-1.5">
                  {/* The resolved unit-status face — dot + pill from the SoT,
                      never a locally invented tone. */}
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', vm.lifecycle.dotClass)} />
                  <span className={vm.lifecycle.pillClass}>{vm.lifecycle.label}</span>
                </span>
              ) : null
            }
          />
          <OrderFactRow label="Grade" value={vm.conditionText} />
          <OrderFactRow label="Location" value={vm.location} mono omitWhenEmpty />
        </OrderFactList>
      </StationCollapsibleBlock>

      {/* 3 · THREAD — takes whatever the collapsed block gives back.
          `/search?sel=unit:` had NO note entry before this (the rail quick-note
          was the only one, and it needed a record already selected). */}
      {hasUnitRow ? (
        <ThreadPanel
          entityType="SERIAL_UNIT"
          entityId={unitId}
          className="min-h-0 flex-1"
          onComposerFocusChange={(focused) =>
            focused ? collapse.engage() : collapse.disengage()
          }
        />
      ) : null}
    </div>
  );
}
