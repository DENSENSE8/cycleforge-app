/** Auth-sessions family verb catalog — declare once, resolve per row. */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';

interface AuthSessionVerbHandlers {
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
