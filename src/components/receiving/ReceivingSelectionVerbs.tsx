'use client';

/**
 * The Inbound triage bars' verbs while receipts or deliveries are checked (Law 5): the
 * receiving selection's catalog — the one `useReceivingLineRailSelection`
 * publishes for the rail — painted as a {@link RecordActionStrip}. Same verbs,
 * same order at 1 or N checked; a verb the check-set cannot run keeps its
 * place, disabled, and says why.
 */

import { useMemo } from 'react';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useRailActionSnapshot } from '@/components/right-rail/RailSelectionActions';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import { resolveSelectionAction } from '@/lib/selection/selection-actions';

export function ReceivingSelectionVerbs({ noun }: { noun: string }) {
  const { scope, rows, actions } = useRailActionSnapshot();
  const verbs = useMemo<RecordActionVerb[]>(() => {
    if (scope !== RECEIVING_SELECTION_SCOPE || rows.length === 0) return [];
    return actions.map((action) => {
      const resolved = resolveSelectionAction(action, rows);
      return {
        id: action.key,
        label: resolved.label,
        icon: action.icon,
        tone: action.tone === 'red' ? 'danger' : 'default',
        placement: action.key === 'delete' ? 'isolated' : 'primary',
        disabled: resolved.disabled,
        disabledReason: resolved.reason,
        run: () => action.run(rows, resolved.direction ? { direction: resolved.direction } : undefined),
      };
    });
  }, [scope, rows, actions]);
  if (verbs.length === 0) return null;
  return <RecordActionStrip verbs={verbs} label={`Checked ${noun} actions`} testId="incoming-bulk" />;
}
