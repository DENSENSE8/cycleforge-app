'use client';

/**
 * `/search?sel=unit:{id}` centre — Status band, then Items band.
 *
 * This used to be a single `Unit` block of `OrderFactList` rows (SKU, Product,
 * Status, Grade, Location). That demoted status from a band to a table cell and
 * never showed the unit as an ITEM at all, so a unit read as a spec sheet while
 * an order two keystrokes away read as a record. Both now compose
 * {@link SearchEntityCentre}; only the contents differ, which is the one
 * difference that was ever real.
 *
 * The facts the old list carried are not lost. SKU, product and grade are the
 * item row's own ledger; status and location are the status band.
 */

import { SearchEntityCentre } from './SearchEntityCentre';
import { SearchUnitItems } from './SearchUnitItems';
import type { AutoCollapseController } from '@/components/station/collapse';
import type { UnitStationIdentityVM } from '@/components/station/unit';
import type { SerialUnitDetailPayload } from '@/components/inventory/types';
import { GridStatusCellValue } from '@/components/ui/grid-cells';

/**
 * Where the unit IS — the lifecycle pill, and the bin it is sitting in.
 *
 * A unit's status is a state, not a pipeline: it has no tested → packed →
 * shipped spine of its own to draw. So the band paints the state face directly
 * rather than borrowing `OrderPipelineSection`, which is typed to a
 * `ShippedOrder` and would be a wrong answer rendered confidently.
 */
function UnitStatusBand({ vm }: { vm: UnitStationIdentityVM }) {
  const location = vm.location?.trim() || '';
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
      {vm.lifecycle ? (
        <GridStatusCellValue
          label={vm.lifecycle.label}
          toneClass={vm.lifecycle.pillClass}
          dotClass={vm.lifecycle.dotClass}
          tooltip={vm.lifecycle.tip}
        />
      ) : (
        <span className="text-role-caption text-text-faint">No status</span>
      )}
      <span className="flex items-baseline gap-2">
        <span className="text-role-eyebrow uppercase tracking-wide text-text-faint">
          Location
        </span>
        <span className="font-mono text-role-caption text-text-default">
          {location || '—'}
        </span>
      </span>
    </div>
  );
}

export function SearchUnitCentre({
  unit,
  vm,
  collapse,
  imageUrl = null,
}: {
  unit: SerialUnitDetailPayload['serial_unit'];
  vm: UnitStationIdentityVM;
  collapse: AutoCollapseController;
  imageUrl?: string | null;
}) {
  return (
    <SearchEntityCentre
      entity="unit"
      collapse={collapse}
      status={<UnitStatusBand vm={vm} />}
      items={<SearchUnitItems unit={unit} imageUrl={imageUrl} />}
    />
  );
}
