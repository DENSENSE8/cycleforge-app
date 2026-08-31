'use client';

/**
 * The rows that sit at the TOP of the ticket composer, inside the outline.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ @ Cc  cc@… [type email…]  ← Public only   │
 *   │ [📷 staged thumbs]                        │
 *   │  Message…                                 │
 *   │ [+] [Internal │ Public]     [↵ File ticket]│
 *   └──────────────────────────────────────────┘
 *
 * Recipients and attachments DESCRIBE the message, so they sit above the text
 * they apply to. The channel is something you DO to the draft, so it lives on
 * the action bar beside `+` ({@link ComposerTicketChannelToggle}) — operator
 * ruling, 2026-08-30.
 *
 * The subject does NOT live here. A title slice at the top of the dock made the
 * composer read as a form, and it duplicated the title the ticket display
 * already carries. It moved into the display's own scroll port on 2026-08-31
 * (operator ruling) — one title, in the thread, scrolled to like any other
 * part of the record.
 *
 * There is no attached-context chip row. Product / “what happened” chips were
 * removed from `+` the same day, so nothing can create one.
 *
 * Nothing here animates. Switching to Public shows the Cc row instantly;
 * tweening its height would push the draft out from under the caret.
 *
 * It renders NOTHING when there is nothing to say — an internal note with no
 * staged photos gets the full field, not an empty rule above it.
 */

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
