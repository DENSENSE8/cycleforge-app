'use client';

/**
 * "Log customer message" — a record verb on the Conversation tab for a customer message that arrived
 * somewhere CycleForge does not sync (a marketplace page, a phone call, an email, a walk-in). Staff paste
 * the words and, when it was not just now, when it was received; it lands as an inbound message waiting
 * for our reply, exactly like a synced one. Offered on customer conversations and unclassified items,
 * never on an internal record (no customer is in it).
 */

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { useSupportItemActions } from '@/lib/support/record/use-support-item';
import { toast } from '@/lib/toast';

export function SupportLogCustomerMessage({ supportItemId, nowMs }: { supportItemId: number; nowMs: number }) {
  const { logInbound } = useSupportItemActions(supportItemId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);

  const close = () => {
    setOpen(false);
    setBody('');
    setReceivedAt(null);
  };

  if (!open) {
    return (
      <div className="flex justify-start">
        <Button
          variant="ghost"
          size="sm"
          icon={<MessageSquarePlus aria-hidden />}
          onClick={() => setOpen(true)}
          data-testid="support-log-customer-message"
        >
          Log customer message
        </Button>
      </div>
    );
  }

  const submit = () => {
    const text = body.trim();
    if (!text || logInbound.isPending) return;
    logInbound.mutate(
      { body: text, occurredAt: receivedAt?.toISOString() ?? null },
      { onSuccess: close, onError: (err) => toast.error(err.message) },
    );
  };

  return (
    <section aria-label="Log customer message" className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface-card p-3">
      <TextField
        label="What the customer wrote or said"
        value={body}
        onChange={setBody}
        multiline
        rows={3}
        autoFocus
        data-testid="support-log-customer-body"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-role-caption text-text-muted">Received</span>
        {/* An exact instant gets the exact control (the Timeline's Log uses the same field); blank = now. */}
        <DateTimePickerField
          value={receivedAt ?? undefined}
          onChange={setReceivedAt}
          placeholder="Now"
          toDate={new Date(nowMs)}
          className="w-auto"
        />
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!body.trim()}
            loading={logInbound.isPending}
            onClick={submit}
            data-testid="support-log-customer-submit"
          >
            Log message
          </Button>
        </div>
      </div>
    </section>
  );
}
