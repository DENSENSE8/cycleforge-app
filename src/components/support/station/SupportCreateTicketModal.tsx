'use client';

/**
 * Minimal create-ticket form for the Support station claim host
 * ({@link useSupportTicketClaimHost}). Subject (required) + first note (optional);
 * on submit the host POSTs `/api/support/tickets` (helpdesk-facade create + link).
 *
 * Composes the house `RightPaneOverlay` (centered) — the same overlay shell the
 * receiving claim wizard uses — rather than hand-rolling a modal.
 */

import { useEffect, useRef, useState } from 'react';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const FIELD_CLASS = cn(
  'w-full rounded-lg border border-border-soft bg-surface-card px-3 py-2 text-role-data text-text-default placeholder:text-text-faint',
  focusRing('field'),
);

export function SupportCreateTicketModal({
  open,
  defaultSubject,
  submitting = false,
  onClose,
  onCreate,
}: {
  open: boolean;
  /** Pre-fill for an anchored create (e.g. "Order #1234"). */
  defaultSubject?: string;
  submitting?: boolean;
  onClose: () => void;
  onCreate: (args: { subject: string; note: string }) => void;
}) {
  const [subject, setSubject] = useState(defaultSubject ?? '');
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset to the anchor's default + focus the subject each time it (re)opens.
  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject ?? '');
    setNote('');
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, defaultSubject]);

  const canSubmit = subject.trim().length > 0 && !submitting;

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      className="h-[min(80vh,26rem)] w-[min(94vw,30rem)]"
      aria-label="Create ticket"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onCreate({ subject: subject.trim(), note });
        }}
        className="flex h-full min-h-0 flex-col gap-3 p-4"
      >
        <h2 className="text-role-caption font-black uppercase tracking-widest text-text-soft">
          New ticket
        </h2>

        <label className="space-y-1">
          <span className="text-role-eyebrow font-bold uppercase tracking-widest text-text-soft">
            Subject
          </span>
          <input
            ref={inputRef}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What is this ticket about?"
            className={FIELD_CLASS}
          />
        </label>

        <label className="flex min-h-0 flex-1 flex-col space-y-1">
          <span className="text-role-eyebrow font-bold uppercase tracking-widest text-text-soft">
            First note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context — becomes the ticket's first comment."
            className={cn(FIELD_CLASS, 'min-h-0 flex-1 resize-none')}
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={submitting} disabled={!canSubmit}>
            Create ticket
          </Button>
        </div>
      </form>
    </RightPaneOverlay>
  );
}
