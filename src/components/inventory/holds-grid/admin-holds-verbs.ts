/** Admin › Holds family verb catalog — declare once, resolve per row. */

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
