/**
 * Staff-directory family verb catalog — declare once, resolve per row.
 *
 * Two verbs, and BOTH replaced something that was not a verb at all:
 *
 * - **Sign-in policy** was a live two-control EDITOR inside the `auth` cell — a
 *   `<select>` for the method and a checkbox for the sensitive-information
 *   wall, each POSTing `/api/admin/staff/update` on change. `CompoundRowAction`
 *   carries a fixed payload and no family in this repo sets
 *   `capabilities.inCellEdit`, so a write whose payload needs a PARAMETER is a
 *   verb that OPENS A PLANE (`StaffAuthPolicyPlane`, Center-Lock L2). The two
 *   facts stay READ facts on the row so they still sort and search.
 * - **Deactivate** was a `<Button>` in a trailing actions cell behind a bare
 *   `window.confirm`. It is a destructive verb (`tone: 'danger'`,
 *   `face: 'trailing'`) confirmed on a real stage-overlay plane
 *   (`StaffDeactivatePlane`) that can name the staffer and say what revoking
 *   their sessions means — which a native confirm string could not.
 *
 * Law §4 (`VERBS_BIND_TO_FIELDS`): DIRECTION comes from row STATE, never from
 * the route. The retired desk rendered its Deactivate button only when
 * `s.active`; that precondition lives here, not at the mount.
 *
 * Callers: StaffTable → useStaffDirectorySpreadsheet.rowActions.
 */

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
