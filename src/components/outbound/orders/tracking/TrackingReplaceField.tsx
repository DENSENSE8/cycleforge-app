'use client';

/**
 * The record's typed tracking field. Edit (`replacing=false`) fixes the current
 * number in place; Replace (`replacing=true`) starts empty, shows the number it
 * retires, and — when that number is a live label bought here — voids the
 * ShipStation label first (PIN step-up). A failed void commits nothing.
 */

import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Checkbox, TextField } from '@/design-system/primitives';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { useOrderLabelSummary } from '@/lib/orders/order-paperwork-client';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { isVoidableLabel, useVoidOrderLabel } from './useVoidOrderLabel';

const trackingKey = (value: string) => value.replace(/\s+/g, '').toUpperCase();

export function TrackingReplaceField({
  orderId,
  current,
  replacing,
  onCommit,
  onCancel,
}: {
  orderId: number;
  current: string | null;
  replacing: boolean;
  onCommit: (tracking: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(replacing ? '' : (current ?? ''));
  const [voidToo, setVoidToo] = useState(true);
  const voidId = useId();
  const summary = useOrderLabelSummary(replacing && current ? orderId : 0);
  const voidLabel = useVoidOrderLabel(orderId);

  const liveLabel =
    replacing && current
      ? (summary.data?.labels ?? []).find(
          (l) => isVoidableLabel(l) && l.trackingNumber != null && trackingKey(l.trackingNumber) === trackingKey(current),
        ) ?? null
      : null;

  const next = value.trim();
  const unchanged = !!current && trackingKey(next) === trackingKey(current);
  const canSubmit = next.length > 0 && !unchanged && !voidLabel.isPending;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    if (liveLabel && voidToo) {
      try {
        await voidLabel.mutateAsync({ label: liveLabel, reason: 'replaced' });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not void the label.');
        return;
      }
    }
    onCommit(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={submit} onKeyDown={onKeyDown} data-testid="tracking-replace-field">
      <TextField
        label="Tracking"
        mono
        value={value}
        onChange={setValue}
        placeholder={replacing ? 'New tracking number' : undefined}
        autoFocus={replacing}
        autoComplete="off"
        spellCheck={false}
      />
      {replacing && current ? (
        <p className={cn(RECORD_LABEL_CLASS, 'flex min-w-0 items-baseline gap-1.5 text-mode-muted')}>
          Replaces
          <span className={cn(RECORD_ID_CLASS, 'truncate line-through')}>{current}</span>
        </p>
      ) : null}
      {liveLabel ? (
        <label htmlFor={voidId} className="flex items-center gap-2 text-sm text-mode-ink">
          <Checkbox id={voidId} checked={voidToo} onCheckedChange={(v) => setVoidToo(v === true)} />
          Void the ShipStation label too
        </label>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit} loading={voidLabel.isPending}>
          {replacing ? 'Replace' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
