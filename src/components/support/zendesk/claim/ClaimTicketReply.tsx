'use client';

/**
 * Link — the same read-before-act display the unbox "Link existing
 * ticket" opens ({@link TicketSplitSurface}): tickets on the left, the picked
 * ticket's thread on the right with its own composer docked at the bottom
 * (`SupportTicketDetail`), so a public reply or internal note goes out the way
 * it does everywhere else. The library photos ride along staged in that
 * composer; they are linked to the ticket only when the reply is sent.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from '@/components/Icons';
import {
  TicketCandidateRows,
  TicketSplitSurface,
} from '@/components/support/context/TicketLinkPopover';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { useTicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { useMyRecentTickets, useZendeskTickets } from '@/hooks/useZendeskQueries';
import { ClaimModeSwitch } from './ClaimModeSwitch';
import type { ZendeskClaimController } from './useZendeskClaimController';

export function ClaimTicketReply({ c }: { c: ZendeskClaimController }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(c.defaultTicketId);
  const trimmed = query.trim();
  // Nothing typed → the operator's own recent tickets; typing searches every status.
  const recent = useMyRecentTickets({ enabled: !trimmed });
  const search = useZendeskTickets(
    { query: trimmed, status: 'all', page: 1, perPage: 25 },
    { enabled: trimmed.length > 0 },
  );
  const listError = trimmed ? search.error : recent.error;
  const listLoading = trimmed ? search.isLoading : recent.isLoading;
  const rows = trimmed
    ? (search.data?.tickets ?? []).map((t) => ({ id: t.id, subject: t.subject, status: String(t.status ?? '') }))
    : (recent.data?.tickets ?? []).map((t) => ({ id: t.id, subject: t.subject, status: t.status ?? '' }));

  // One bag for whichever ticket is open: the chosen library photos are staged
  // once, unlinked — browsing tickets must not attach evidence to each one.
  const staging = useTicketPhotoStaging({ kind: 'ticket', ticketId: selectedId ?? 0 });
  const seeded = useRef(false);
  const { addLibraryPhotos } = staging;
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    addLibraryPhotos(
      c.libraryPhotos.map((p) => ({
        id: p.id,
        url: p.displayUrl ?? p.src,
        thumbUrl: p.src,
        caption: p.caption,
      })),
      { link: false },
    );
  }, [addLibraryPhotos, c.libraryPhotos]);

  const count = c.libraryPhotos.length;
  const locked = c.defaultTicketId != null;

  return (
    <TicketSplitSurface
      chrome="panel"
      heading="Link ticket"
      description={`${count} photo${count === 1 ? '' : 's'} attached`}
      onClose={c.onClose}
      headerTrailing={locked ? undefined : <ClaimModeSwitch value={c.mode} onChange={c.setMode} />}
      search={{ value: query, onChange: setQuery }}
      list={
        <>
          {trimmed ? null : (
            <p className="px-4 pt-1 text-role-eyebrow text-text-faint" data-testid="claim-reply-recent-eyebrow">
              My recent tickets
            </p>
          )}
          {listError ? (
            <p className="px-4 py-4 text-role-caption text-text-danger">{listError.message}</p>
          ) : listLoading ? (
            <p className="flex items-center gap-2 px-4 py-4 text-role-caption text-text-soft">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading tickets…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-4 text-role-caption text-text-faint">
              {trimmed ? 'No matching tickets' : 'No recent tickets'}
            </p>
          ) : (
            <TicketCandidateRows rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </>
      }
    >
      {selectedId == null ? (
        <p className="flex h-full items-center justify-center text-role-body text-text-faint">
          Select a ticket to read it.
        </p>
      ) : (
        <SupportTicketDetail
          key={selectedId}
          ticketId={selectedId}
          embedded
          hideLinkedContext
          photoStaging={staging}
        />
      )}
    </TicketSplitSurface>
  );
}
