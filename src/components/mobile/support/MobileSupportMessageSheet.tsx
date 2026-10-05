'use client';

/**
 * The phone record's two writes, one dock verb each, in the house bottom sheet
 * (`MobileV2ActionSheet`: header · one body · `DetailDock placement="sheet"`):
 *
 * - **Add internal note** — `POST /api/support/items/[id]/messages`
 *   `{ direction: 'internal', body }` (`useSupportItemActions().addInternal`):
 *   staff-only, never reaches the customer.
 * - **Log customer message** — the same route with `{ direction: 'inbound',
 *   body, occurredAt? }` (`logInbound`): a customer message that arrived
 *   somewhere CycleForge does not sync (a marketplace page, a call, an email,
 *   a walk-in). It lands waiting for our reply, exactly like a synced one.
 *   "Received" blank = now.
 *
 * Neither sends anything to a customer; the phone has no Send / Copy & open.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { TextField } from '@/design-system/primitives/TextField';
import { SUPPORT_LIST_QUERY_KEY } from '@/lib/support/list/use-support-list';
import { useSupportItemActions } from '@/lib/support/record/use-support-item';
import { toast } from '@/lib/toast';

export type MobileSupportWrite = 'note' | 'customer';

const FACE: Readonly<
  Record<MobileSupportWrite, { title: string; description: string; field: string; commit: string; missing: string; done: string }>
> = {
  note: {
    title: 'Add internal note',
    description: 'Staff only — the customer never sees it.',
    field: 'Internal note',
    commit: 'Add note',
    missing: 'Write the note first',
    done: 'Note added',
  },
  customer: {
    title: 'Log customer message',
    description: 'A message that arrived somewhere CycleForge does not sync. It lands waiting for our reply.',
    field: 'What the customer wrote or said',
    commit: 'Log message',
    missing: 'Paste the message first',
    done: 'Customer message logged',
  },
};

export function MobileSupportMessageSheet({
  supportItemId,
  write,
  onClose,
}: {
  supportItemId: number;
  /** The open write; null = closed. */
  write: MobileSupportWrite | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { addInternal, logInbound } = useSupportItemActions(supportItemId);
  const [body, setBody] = useState('');
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);
  const face = FACE[write ?? 'note'];
  const pending = addInternal.isPending || logInbound.isPending;
  const text = body.trim();

  const close = () => {
    if (pending) return;
    setBody('');
    setReceivedAt(null);
    onClose();
  };

  const submit = () => {
    if (!text || pending || !write) return;
    const handlers = {
      onSuccess: () => {
        // The list's flags and status move with the write (needs reply, customer followed up).
        void queryClient.invalidateQueries({ queryKey: SUPPORT_LIST_QUERY_KEY });
        toast.success(face.done);
        setBody('');
        setReceivedAt(null);
        onClose();
      },
      onError: (err: Error) => toast.error(err.message),
    };
    if (write === 'note') addInternal.mutate(text, handlers);
    else logInbound.mutate({ body: text, occurredAt: receivedAt?.toISOString() ?? null }, handlers);
  };

  return (
    <MobileV2ActionSheet<'cancel' | 'commit'>
      open={write !== null}
      onClose={close}
      eyebrow={`Support #${supportItemId}`}
      title={face.title}
      description={face.description}
      dockLabel={`${face.title} actions`}
      testId="mobile-support-write-sheet"
      verbs={[
        { id: 'cancel', label: 'Cancel', icon: <X />, disabled: pending },
        {
          id: 'commit',
          // R9: a disabled CTA names what is missing.
          label: text ? face.commit : face.missing,
          icon: <Check />,
          primary: true,
          disabled: !text,
          loading: pending,
          testId: 'mobile-support-write-commit',
        },
      ]}
      onVerb={(verb) => (verb === 'cancel' ? close() : submit())}
    >
      <div className="flex flex-col gap-3 px-mode-page py-3">
        <TextField
          label={face.field}
          value={body}
          onChange={setBody}
          multiline
          rows={5}
          autoFocus
          data-testid="mobile-support-write-body"
        />
        {write === 'customer' ? (
          <div className="flex flex-col gap-1">
            <span className="text-role-caption text-text-muted">Received</span>
            <DateTimePickerField
              value={receivedAt ?? undefined}
              onChange={setReceivedAt}
              placeholder="Now"
              ariaLabel="Received"
              toDate={new Date()}
              className="min-h-11"
            />
          </div>
        ) : null}
      </div>
    </MobileV2ActionSheet>
  );
}
