'use client';

/**
 * Ticket subject — the ONE click-to-edit subject control.
 *
 * Click the title to edit; blur or Enter commits; Escape discards. No save /
 * cancel buttons — those fought the inline affordance and duplicated the
 * keyboard / click-off path.
 *
 * Identity owns the subject on `/support`, the chat header suppresses it
 * there (`hideTitle`), and BOTH compose this field, so the subject stays
 * editable wherever it is the one on screen.
 *
 * Density follows the host: `compact` is the dense caption used inside a station
 * rail or a pane-header identity row; the default is the console's body size.
 * Never a wrapping hero title — rail identity is capped at caption density
 * (`display/right-rail-inspector.md`), which is why the label truncates rather
 * than wraps in both.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useUpdateTicket } from '@/hooks/useZendeskQueries';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


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
  /**
   * Rendered after the title — ephemeral edit chrome only. Ticket `#` is NOT a
   * trailing sibling: it lives on {@link StackedRowIdentity}'s keys row under
   * the subject (`SupportTicketIdMark`).
   */
  trailing?: ReactNode;
  className?: string;
}) {
  const update = useUpdateTicket();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const committedRef = useRef(false);
  const ticketKey = ticketId ?? 0;

  const current = optimistic ?? subject ?? '';
  const typeClass = compact ? 'text-role-caption' : 'text-role-body';

  useEffect(() => {
    setOptimistic(null);
  }, [ticketKey]);

  const startEdit = () => {
    committedRef.current = false;
    setDraft(current);
    setEditing(true);
  };

  const save = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (ticketId == null) {
      setEditing(false);
      return;
    }
    const next = draft.trim();
    if (next && next !== current) {
      setOptimistic(next);
      update.mutate(
        { id: ticketId, patch: { subject: next } },
        { onError: () => setOptimistic(null) },
      );
    }
    setEditing(false);
  };

  const cancel = () => {
    committedRef.current = true;
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={cn('flex min-w-0 flex-1 items-center gap-1.5', className)}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          className={cn(
            'min-w-0 flex-1 rounded-md border border-blue-300 bg-surface-card px-2 py-0.5 font-semibold tracking-tight text-text-default',
            focusRing('field', 'accent'),
            typeClass,
          )}
        />
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
            'min-w-0 flex-1 truncate text-left font-semibold tracking-tight text-text-default',
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
