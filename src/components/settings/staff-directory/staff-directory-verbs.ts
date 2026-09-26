/** Staff-directory family verb catalog — declare once, resolve per row. */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';

export interface StaffDirectoryVerbHandlers {
  /** Opens the sign-in-policy plane for this teammate. */
  onEditAuthPolicy: (row: StaffDirectoryRow) => void;
  /** Opens the deactivate confirm plane for this teammate. */
  onDeactivate: (row: StaffDirectoryRow) => void;
}

/** Resolve the family's row verbs for one teammate. */
export function resolveStaffDirectoryRowActions(
  row: StaffDirectoryRow,
  handlers: StaffDirectoryVerbHandlers,
): readonly CompoundRowAction[] {
  const actions: CompoundRowAction[] = [
    {
      key: 'auth-policy',
      label: 'Sign-in policy…',
      onSelect: () => handlers.onEditAuthPolicy(row),
    },
  ];
  // Already deactivated ⇒ the verb does not apply. The retired cell expressed
  // the same precondition by rendering nothing.
  if (row.active) {
    actions.push({
      key: 'deactivate',
      label: 'Deactivate',
      tone: 'danger',
      face: 'trailing',
      onSelect: () => handlers.onDeactivate(row),
    });
  }
  return actions;
}
