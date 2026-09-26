'use client';

/** Support · Tickets — the `service-workspace` branch mount. */

import { useCallback, useMemo, useState } from 'react';
import { SupportTicketFocus } from '@/components/support/service-workspace/SupportTicketFocus';
import {
  ServiceWorkspaceShell,
  useSupportTicketDisplays,
} from '@/components/support/service-workspace';
import { SupportContextDetailPanel } from '@/components/support/context';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { useSupportContext } from '@/hooks/useSupportContext';
import { useSupportTicketParam } from '@/hooks/useSupportTicketParam';
import { useTicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { SupportTicketsBoard } from './SupportTicketsBoard';

export function SupportTicketsWorkspace() {
  const { ticketId, setTicket } = useSupportTicketParam();
  const clearTicket = () => setTicket(null);

  const anchor = useMemo(
    () => (ticketId ? { ticket: String(ticketId) } : null),
    [ticketId],
  );

  // The thread's composer bridge is owned HERE because two siblings need it:
  // the thread's own terminal dock, and the rail's Assist display, which drafts
  // into the same composer. One owner, one composer.
  const [ticketBridge, setTicketBridge] = useState<ThreadComposerBridge | null>(null);

  // Open by default (the old private aside was unconditional), but dismissible — a non-modal push column has no scrim, so its close button…
  const [contextOpen, setContextOpen] = useState(true);

  // Same cached query the thread and the rail already read — one fetch, three readers.
  const { data: contextBundle } = useSupportContext(anchor ?? {}, anchor != null);
  const providerTicketId = contextBundle?.ticket?.providerTicketId ?? ticketId ?? 0;

  // The vision loop's shared state. Staging is owned here for the same reason
  // the bridge is: the paste lands on the THREAD and the draft is prepared in
  // the RAIL, and they are siblings. Two owners would be two bags of photos.
  const photoStaging = useTicketPhotoStaging(providerTicketId);
  const [assistRunId, setAssistRunId] = useState(0);
  const [displayFocus, setDisplayFocus] = useState<{ id: string; req: number }>({
    id: '',
    req: 0,
  });

  /** An image was pasted onto the ticket. */
  const handlePastedImages = useCallback((files: File[]) => {
    if (!files.length) return;
    photoStaging.addFiles(files);
    setContextOpen(true);
    setAssistRunId((n) => n + 1);
    setDisplayFocus((prev) => ({ id: 'assist', req: prev.req + 1 }));
  }, [photoStaging]);

  const vision = useMemo(
    () => ({
      stagedPhotos: photoStaging.staged,
      stagingUploading: photoStaging.uploading,
      autoRunId: assistRunId,
    }),
    [photoStaging.staged, photoStaging.uploading, assistRunId],
  );

  // Connections · Conversations · Timeline · Assist. Built here, unconditionally,
  // because the rail is mounted here — the hook is inert (and its query
  // disabled) while no ticket is open.
  const displays = useSupportTicketDisplays(anchor, ticketBridge, vision);

  return (
    <>
      <ServiceWorkspaceShell
        list={<SupportTicketsBoard />}
        listHidden={ticketId != null}
        threadKey={ticketId}
        thread={
          ticketId != null ? (
            <SupportTicketFocus
              ticketId={ticketId}
              onClose={clearTicket}
              contextOpen={contextOpen}
              onToggleContext={() => setContextOpen((o) => !o)}
              ticketBridge={ticketBridge}
              onBridgeChange={setTicketBridge}
              providerTicketId={providerTicketId}
              photoStaging={photoStaging}
              onPasteImages={handlePastedImages}
            />
          ) : null
        }
      />
      {ticketId != null && anchor ? (
        <SupportContextDetailPanel
          ticketId={ticketId}
          anchor={anchor}
          open={contextOpen}
          // Closing the extras must not close the ticket: the thread is the work,
          // the rail is the context beside it. Re-opens from the thread header's
          // Connections toggle.
          onClose={() => setContextOpen(false)}
          push
          displays={displays}
          focusDisplay={displayFocus.id}
          focusRequestId={displayFocus.req}
        />
      ) : null}
    </>
  );
}
