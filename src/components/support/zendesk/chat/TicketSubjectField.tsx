'use client';

/**
 * Ticket subject — the ONE click-to-edit subject control.
 *
 * It exists because the subject had two renderers and the surface showed it
 * twice: `SupportChatHeader` drew an editable title, and on `/support` the
 * thread's split header ({@link SupportTicketPaneHeader} → `SupportTicketIdentity`)
 * drew the same string one row above it. Two components rendering one fact is a
 * fork whether or not they agree — and these did not even agree on affordance,
 * because only one of them could be edited.
 *
 * So: identity owns the subject on `/support`, the chat header suppresses it
 * there (`hideTitle`), and BOTH compose this field, so the subject stays
 * editable wherever it is the one on screen.
 *
 * Density follows the host: `compact` is the dense caption used inside a station
 * rail or a pane-header identity row; the default is the console's body size.
 * Never a wrapping hero title — rail identity is capped at caption density
 * (`display/right-rail-inspector.md`), which is why the label truncates rather
 * than wraps in both.
 */

import { useState, type ReactNode } from 'react';
import { Check, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { useUpdateTicket } from '@/hooks/useZendeskQueries';
import { cn } from '@/utils/_cn';

export function TicketSubjectField({
  ticketId,
  subject,
  compact = false,
  trailing,
  className,
}: {
  /**
   * Provider ticket id the patch is addressed to. `null` while a bundle is
   * still resolving it — the subject renders as plain text rather than an edit
   * affordance that would post nowhere.
   */
  ticketId: number | null;
  subject: string | null | undefined;
  /** Dense caption density (station rail / pane-header identity row). */
  compact?: boolean;
  /** Rendered after the title — e.g. the short `#id` mark. */
  trailing?: ReactNode;
  className?: string;
}) {
  const update = useUpdateTicket();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const current = subject || '';
  const typeClass = compact ? 'text-role-caption' : 'text-role-body';

  const startEdit = () => {
    setDraft(current);
    setEditing(true);
  };

  const save = () => {
    if (ticketId == null) {
      setEditing(false);
      return;
    }
    const next = draft.trim();
    if (next && next !== current) update.mutate({ id: ticketId, patch: { subject: next } });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={cn('flex min-w-0 flex-1 items-center gap-1.5', className)}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          className={cn(
            'min-w-0 flex-1 rounded-md border border-blue-300 bg-surface-card px-2 py-0.5 font-semibold tracking-tight text-text-default outline-none focus:ring-2 focus:ring-blue-100',
            typeClass,
          )}
        />
        <HoverTooltip label="Save title" asChild>
          <IconButton
            icon={<Check className="h-3.5 w-3.5 text-white" />}
            onClick={save}
            disabled={update.isPending}
            ariaLabel="Save title"
            className="shrink-0 rounded-md bg-blue-600 p-1 hover:bg-blue-700"
          />
        </HoverTooltip>
        <HoverTooltip label="Cancel" asChild>
          <IconButton
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => setEditing(false)}
            ariaLabel="Cancel"
            className="shrink-0 rounded-md p-1 hover:bg-surface-sunken"
          />
        </HoverTooltip>
      </div>
    );
  }

  if (ticketId == null) {
    return (
      <div className={cn('flex min-w-0 flex-1 items-center gap-1.5', className)}>
        <p className={cn('min-w-0 flex-1 truncate font-semibold tracking-tight text-text-default', typeClass)}>
          {current || '(no subject)'}
        </p>
        {trailing}
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1.5', className)}>
      <HoverTooltip label="Click to edit title" asChild>
        {/* ds-raw-button: text-left inline-editable title (truncating subject), not a standard action Button */}
        <button
          type="button"
          onClick={startEdit}
          aria-label="Click to edit title"
          className={cn(
            'min-w-0 flex-1 truncate text-left font-semibold tracking-tight text-text-default transition hover:text-blue-700',
            typeClass,
          )}
        >
          {current || '(no subject)'}
        </button>
      </HoverTooltip>
      {trailing}
    </div>
  );
}
