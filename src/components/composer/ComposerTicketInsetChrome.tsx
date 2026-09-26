'use client';

/** The rows that sit at the TOP of the ticket composer, inside the outline. */

import type { ReactNode } from 'react';
import { ComposerTicketCcStrip } from './ComposerTicketCcStrip';

export function ComposerTicketInsetChrome({
  isPublic,
  ccs,
  onCcsChange,
  ccDraft,
  onCcDraftChange,
  requesterEmail,
  ticketId,
  trailing,
}: {
  isPublic: boolean;
  ccs: string[];
  onCcsChange: (next: string[]) => void;
  ccDraft: string;
  onCcDraftChange: (next: string) => void;
  requesterEmail?: string | null;
  ticketId?: number | null;
  /** Staged photo thumbs — mounted by the host that owns the staging bag. */
  trailing?: ReactNode;
}) {
  if (!isPublic && !trailing) return null;

  return (
    <div
      data-testid="composer-ticket-inset"
      data-composer-channel={isPublic ? 'public' : 'internal'}
      className="flex min-w-0 flex-col gap-0.5 border-b border-border-hairline px-1.5 py-1"
    >
      {isPublic ? (
        <ComposerTicketCcStrip
          ccs={ccs}
          onCcsChange={onCcsChange}
          draft={ccDraft}
          onDraftChange={onCcDraftChange}
          requesterEmail={requesterEmail}
          ticketId={ticketId}
        />
      ) : null}
      {trailing}
    </div>
  );
}
