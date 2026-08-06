'use client';

/**
 * Manual ticket NAS backup strip for the photo-library ticket leaf.
 * Shown under the ticket path chrome — not claim-modal-only.
 */

import { Folder } from '@/components/Icons';
import { Panel } from '@/design-system/primitives';
import { TicketNasBackupButton } from './TicketNasBackupButton';
import { claimsTicketLabel } from '@/lib/photos/display-names';

export function PhotoLibraryTicketNasBackup({
  ticketId,
}: {
  /** Zendesk ticket id from the library filter / folder leaf. */
  ticketId: string;
}) {
  const trimmed = ticketId.trim().replace(/^#/, '');
  if (!trimmed) return null;

  return (
    <Panel
      data-testid="photo-library-ticket-nas-backup"
      padding="none"
      radius="xl"
      elevation="md"
      className="mb-3 flex flex-wrap items-center gap-3 px-3 py-2.5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Folder className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <div className="min-w-0">
          <p className="text-role-caption font-semibold text-text-default">
            Ticket {claimsTicketLabel(trimmed)} · NAS backup
          </p>
          <p className="text-role-micro text-text-muted">
            Sync carton photos to NAS folder {claimsTicketLabel(trimmed)}
          </p>
        </div>
      </div>
      <TicketNasBackupButton
        ticketNumber={trimmed}
        label="Sync to NAS"
        tooltip={`Sync photos · ${claimsTicketLabel(trimmed)}`}
      />
    </Panel>
  );
}
