/**
 * Auth-sessions family verb catalog — declare once, resolve per row.
 *
 * Revoke is a credential verb (`face: 'trailing'`), not a catalog field and not
 * a remounted compound `actions` track. The desk carried it as a fifth column
 * of `<Button>` JSX behind a bare `window.confirm`; both are gone — the verb
 * reaches the row menu and the trailing face, and the confirm is a real
 * stage-overlay plane (`AuthSessionRevokePlane`).
 *
 * Callers: SessionsSection → useAuthSessionsSpreadsheet.rowActions.
 */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';

export interface AuthSessionVerbHandlers {
  onRevoke: (row: AuthSessionTableRow) => void;
}

/** Resolve the family's row verbs for one live session. */
export function resolveAuthSessionRowActions(
  row: AuthSessionTableRow,
  handlers: AuthSessionVerbHandlers,
): readonly CompoundRowAction[] {
  return [
    {
      key: 'revoke',
      label: 'Revoke',
      tone: 'danger',
      face: 'trailing',
      onSelect: () => handlers.onRevoke(row),
    },
  ];
}
