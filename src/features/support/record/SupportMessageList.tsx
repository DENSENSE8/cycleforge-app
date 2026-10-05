'use client';

/**
 * The Support item's thread, oldest first, Messages-style (customer left on
 * the sunken plane, our replies right on the info tint, internal notes with a
 * lock on the warning tint). Under each message its state: an inbound message
 * is waiting for our reply, answered by a named reply, or closed as needing
 * none (by whom, why); an outbound reply shows its delivery. A copied reply
 * offers Mark sent; a pending inbound offers No reply required (reason
 * required).
 */

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import type { SupportItemView, SupportMessageView } from '@/lib/support/conversation/model';
import { supportContactFace } from '@/lib/support/contact-face';
import { taskBoardAgo } from '@/lib/task-board/task-board-model';
import { formatMonthDayTimePST } from '@/utils/date';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { SupportChip } from '@/components/ui/SupportChip';
import {
  supportDismissBody,
  supportMessageCanDismiss,
  supportMessageCanMarkSent,
  supportMessageChip,
} from '@/lib/support/record/support-record-model';
import { useSupportItemActions } from '@/lib/support/record/use-support-item';

function authorName(m: SupportMessageView, item: SupportItemView): string {
  if (m.direction === 'inbound') {
    const face = supportContactFace({
      name: m.author.label ?? item.requester.name,
      email: item.requester.email,
      handle: item.requester.handle,
    });
    return face.label ?? 'Customer';
  }
  return m.author.staff?.name ?? m.author.label ?? 'Staff';
}

export function SupportMessageList({
  item,
  messages,
  nowMs,
}: {
  item: SupportItemView;
  messages: readonly SupportMessageView[];
  nowMs: number;
}) {
  const actions = useSupportItemActions(item.id);
  const [dismissing, setDismissing] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  if (messages.length === 0) {
    return <p className="py-6 text-center text-role-caption text-text-muted">No messages yet.</p>;
  }

  // Mark sent answers the customer: the actions hook owes the record its next-step choice when it lands.
  const markSent = (messageId: number) =>
    actions.patchMessage.mutate({ messageId, body: { delivery: 'sent' } }, { onError: (err) => toast.error(err.message) });

  const dismiss = (messageId: number) => {
    const request = supportDismissBody(reason);
    if (!request.ok) {
      toast.error(request.error);
      return;
    }
    actions.patchMessage.mutate(
      { messageId, body: request.body },
      {
        onSuccess: () => {
          setDismissing(null);
          setReason('');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <ol className="flex flex-col gap-3" aria-label="Messages">
      {messages.map((m) => {
        const ours = m.direction !== 'inbound';
        const internal = m.direction === 'internal';
        const chip = supportMessageChip(m);
        const atMs = Date.parse(m.occurredAt);
        return (
          <li
            key={m.id}
            data-testid={`support-message-${m.id}`}
            data-direction={m.direction}
            className={cn('flex flex-col gap-1', ours ? 'items-end pl-12' : 'items-start pr-12')}
          >
            <span className="flex items-center gap-1 px-1 text-role-caption text-text-muted">
              {internal ? <Lock aria-label="Internal note" className="size-3" /> : null}
              <span className="font-semibold text-text-default">{authorName(m, item)}</span>
              <span className="tabular-nums">#{m.id}</span>
              <time className="tabular-nums" dateTime={m.occurredAt} title={formatMonthDayTimePST(m.occurredAt)}>
                {Number.isFinite(atMs) ? taskBoardAgo(atMs, nowMs) : ''}
              </time>
            </span>
            <p
              className={cn(
                'whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-role-data text-text-default',
                internal ? 'bg-fill-warning/15' : ours ? 'bg-fill-info/15' : 'bg-surface-sunken',
              )}
            >
              {m.body.trim()}
            </p>
            {chip || m.deliveryError || supportMessageCanMarkSent(m) || supportMessageCanDismiss(m) ? (
              <div className={cn('flex flex-wrap items-center gap-1.5 px-1', ours ? 'justify-end' : 'justify-start')}>
                {chip ? <SupportChip tone={chip.tone} label={chip.label} testId={`support-message-state-${m.id}`} /> : null}
                {m.replyDisposition === 'no_reply_required' && m.disposition?.reason ? (
                  <span className="text-role-caption text-text-muted">{m.disposition.reason}</span>
                ) : null}
                {m.deliveryError ? <span className="text-role-caption text-text-danger">{m.deliveryError}</span> : null}
                {supportMessageCanMarkSent(m) ? (
                  <Button
                    variant="successSoft"
                    size="sm"
                    loading={actions.patchMessage.isPending && actions.patchMessage.variables?.messageId === m.id}
                    onClick={() => markSent(m.id)}
                    data-testid="support-mark-sent"
                  >
                    Mark sent
                  </Button>
                ) : null}
                {supportMessageCanDismiss(m) && dismissing !== m.id ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDismissing(m.id);
                      setReason('');
                    }}
                    data-testid="support-no-reply-required"
                  >
                    No reply required
                  </Button>
                ) : null}
              </div>
            ) : null}
            {dismissing === m.id ? (
              <div className="flex w-full flex-col gap-2 rounded-2xl border border-border-soft bg-surface-card p-2">
                <TextField
                  label="Why no reply is needed"
                  value={reason}
                  onChange={setReason}
                  multiline
                  rows={2}
                  autoFocus
                  data-testid="support-no-reply-reason"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDismissing(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!reason.trim()}
                    loading={actions.patchMessage.isPending}
                    onClick={() => dismiss(m.id)}
                    data-testid="support-no-reply-confirm"
                  >
                    Mark no reply required
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
