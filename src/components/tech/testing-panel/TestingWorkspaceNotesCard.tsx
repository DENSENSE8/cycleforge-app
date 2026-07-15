'use client';

/**
 * TestingWorkspaceNotesCard — header-less carton notes composer for the testing
 * overview tab. Adapts the shared {@link LineNotesCard} + {@link useSyncedPoNote}
 * so testing matches unbox (`WorkspaceNotesCard`) without forking the composer.
 */

import { useCallback } from 'react';
import { LineNotesCard } from '@/components/receiving/workspace/line-edit/LineNotesCard';
import { useSyncedPoNote } from '@/components/receiving/workspace/line-edit/hooks/useSyncedPoNote';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { TestingController } from './testing-panel-types';

export function TestingWorkspaceNotesCard({
  row,
  c,
}: {
  row: ReceivingLineRow;
  c: TestingController;
}) {
  // Sync-to-PO feedback is toast-enough for testing; no workspace feedback slot.
  const onActionFeedback = useCallback(() => {}, []);
  const { saveOverallNote } = useSyncedPoNote(row, onActionFeedback);
  const unfound = shouldUseUnmatchedItemsSurface(row);

  return (
    <div id="testing-notes-card">
      <LineNotesCard
        notes={c.notes}
        overallZohoNotes={row.receiving_zoho_notes ?? null}
        skuTitle={row.zoho_item_title || row.item_name || null}
        unitPrice={row.unit_price ?? null}
        zendeskTicket={c.zendeskTrimmed || row.zendesk_ticket || null}
        zendeskProviderTicketId={c.providerTicketId}
        zendeskTicketSubject={c.supportTicket?.subject ?? null}
        onNotesChange={c.setNotes}
        onSaveNotes={() => {
          const next = c.notes;
          if (next === (row.notes || '')) return false;
          void c.patch({ notes: next });
          return true;
        }}
        onSaveOverallNote={saveOverallNote}
        showSyncToPo={!unfound}
      />
    </div>
  );
}
