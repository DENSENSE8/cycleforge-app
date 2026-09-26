'use client';

/** Ticket subject — the ONE click-to-edit subject control. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { useUpdateTicket } from '@/hooks/useZendeskQueries';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

/** House ticket mark — same 14px slot as station band glyphs ({@link StationCollapsibleBlock}). */
function TicketTitleGlyph({ compact, stacked }: { compact: boolean; stacked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
        // Two-line identity: keep the glyph on the title cap, not vertically
        // centred against title + headline.
        stacked && compact && 'mt-0.5',
      )}
    >
      <Ticket
        className={cn(
          'text-orange-500',
          compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
        )}
      />
    </span>
  );
}


export function TicketSubjectField({
  ticketId,
  subject,
  compact = false,
  trailing,
  headline,
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
   * trailing sibling: it lives on {@link headline} or
   * {@link StackedRowIdentity}'s keys row (`SupportTicketIdMark`).
   */
  trailing?: ReactNode;
  /**
   * Second-row subhead under the subject (id · opened date). Omit on hosts
   * that already stack keys (`SupportTicketIdentity`).
   */
  headline?: ReactNode;
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

  const shell = (title: ReactNode) => (
    <div
      className={cn(
        'flex min-w-0 flex-1 gap-1.5',
        headline ? 'items-start' : 'items-center',
        className,
      )}
    >
      <TicketTitleGlyph compact={compact} stacked={Boolean(headline)} />
      {headline ? (
        <StackedRowIdentity
          className="min-w-0 flex-1"
          title={title}
          keys={headline}
          trailing={trailing}
        />
      ) : (
        <>
          {title}
          {trailing}
        </>
      )}
    </div>
  );

  if (editing) {
    return shell(
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
          'min-w-0 w-full rounded-md border border-blue-300 bg-surface-card px-2 py-0.5 font-semibold tracking-tight text-text-default',
          focusRing('field', 'accent'),
          typeClass,
        )}
      />,
    );
  }

  if (ticketId == null) {
    return shell(
      <p className={cn('min-w-0 w-full truncate font-semibold tracking-tight text-text-default', typeClass)}>
        {current || '(no subject)'}
      </p>,
    );
  }

  return shell(
    <HoverTooltip label="Click to edit title" asChild>
      {/* ds-raw-button: text-left inline-editable title (truncating subject), not a standard action Button */}
      <button
        type="button"
        onClick={startEdit}
        aria-label="Click to edit title"
        className={cn(
          'min-w-0 w-full truncate text-left font-semibold tracking-tight text-text-default',
          typeClass,
        )}
      >
        {current || '(no subject)'}
      </button>
    </HoverTooltip>,
  );
}
