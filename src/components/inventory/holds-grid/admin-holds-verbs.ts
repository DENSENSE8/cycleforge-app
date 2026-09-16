/**
 * Admin › Holds family verb catalog — declare once, resolve per row.
 *
 * Release is the desk's ONE verb (`face: 'trailing'`), not a catalog field and
 * not a remounted compound `actions` track. The retired desk carried it as a
 * seventh column containing a whole `<form action={releaseAction}>`: a
 * `<select name="forceStatus">` beside a raw solid-green `<button>` annotated
 * `ds-raw-button`, submitting with no confirmation of any kind. One stray click
 * put a quarantined unit back into stock.
 *
 * All of that is gone. The verb reaches the row's trailing face and opens
 * `HoldReleasePlane` — because a write whose PAYLOAD takes a parameter (the
 * restore-status override) is a verb that opens a plane, not an editor inside a
 * compound row. No family in this repo sets `capabilities.inCellEdit`, so a
 * `<select>` in a cell is not a thing that exists here.
 *
 * `tone` stays default: releasing a unit is the desk's happy path (the hold was
 * the intervention), so painting it destructive would invert what the operator
 * is being warned about.
 *
 * Callers: HeldUnitsTable → useAdminHoldsSpreadsheet.rowActions.
 */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { HeldUnitRow } from '@/lib/inventory/held-unit-row';

export interface AdminHoldsVerbHandlers {
  /** Opens the release plane for this unit. The plane owns the write. */
  onRelease: (row: HeldUnitRow) => void;
}

/** Resolve the family's row verbs for one held unit. */
export function resolveAdminHoldsRowActions(
  row: HeldUnitRow,
  handlers: AdminHoldsVerbHandlers,
): readonly CompoundRowAction[] {
  return [
    {
      key: 'release',
      label: 'Release',
      face: 'trailing',
      onSelect: () => handlers.onRelease(row),
    },
  ];
}
