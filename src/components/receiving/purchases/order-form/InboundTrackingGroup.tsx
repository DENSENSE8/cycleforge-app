'use client';

/**
 * The form's Tracking group — unlimited numbers (one order can ship in many
 * boxes): paste a whole list and it splits into rows; Enter goes on to the
 * next row; the carrier is detected from each number.
 */

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Plus, Trash2 } from '@/components/Icons';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import {
  addInboundTracking,
  inboundTrackingCarrier,
  removeInboundTracking,
  splitPastedList,
} from '@/lib/inbound/inbound-order-compose';
import type { InboundOrderFormModel } from '@/lib/inbound/use-inbound-order-form';

export function InboundTrackingGroup({ form }: { form: InboundOrderFormModel }) {
  const { draft, missing } = form;
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const filled = draft.tracking.filter((t) => t.number.trim()).length;
  const flagged = missing.some((m) => m.field === 'tracking');

  useEffect(() => {
    if (focusRow == null) return;
    inputs.current[focusRow]?.focus();
    setFocusRow(null);
  }, [focusRow, draft.tracking.length]);

  // Enter: on to a blank row (the next empty one, else a new one).
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    if (!draft.tracking[index]?.number.trim()) return;
    const blank = draft.tracking.findIndex((t) => !t.number.trim());
    if (blank >= 0) {
      setFocusRow(blank);
      return;
    }
    form.patch({ tracking: [...draft.tracking, { number: '', carrier: '' }] });
    setFocusRow(draft.tracking.length);
  };

  // A paste of many numbers becomes many rows (blank rows fill first).
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const numbers = splitPastedList(event.clipboardData.getData('text'));
    if (numbers.length < 2) return;
    event.preventDefault();
    form.patch({ tracking: addInboundTracking(draft, numbers).tracking });
  };

  return (
    <RecordGroup title={filled ? `Tracking · ${filled}` : 'Tracking'} testId="inbound-tracking-group">
      <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
        <p className="text-role-caption text-text-muted">
          Every box has its own number — paste a whole list at once; Enter goes to the next row.
        </p>
        <ol className="flex flex-col gap-2" aria-label="Tracking numbers">
          {draft.tracking.map((tracking, index) => {
            const carrier = inboundTrackingCarrier(tracking);
            return (
              <li key={index} className="flex items-center gap-2">
                <TextField
                  ref={(el) => {
                    inputs.current[index] = el;
                  }}
                  label={draft.type === 'RETURN' && index === 0 ? 'Return tracking number *' : `Tracking number ${index + 1}`}
                  value={tracking.number}
                  mono
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={(index === 0 && flagged) || undefined}
                  onChange={(number) => form.patch({ tracking: draft.tracking.map((t, i) => (i === index ? { ...t, number } : t)) })}
                  onKeyDown={onKeyDown(index)}
                  onPaste={onPaste}
                  trailing={carrier ? <span className="pr-3 text-role-caption text-text-muted">{carrier}</span> : null}
                  data-testid={`inbound-tracking-${index}`}
                />
                <IconButton
                  size="md"
                  icon={<Trash2 className="h-4 w-4" />}
                  ariaLabel={`Remove tracking number ${index + 1}`}
                  disabled={draft.tracking.length === 1 && !tracking.number.trim()}
                  onClick={() => form.patch({ tracking: removeInboundTracking(draft, index).tracking })}
                />
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus />}
            onClick={() => {
              form.patch({ tracking: [...draft.tracking, { number: '', carrier: '' }] });
              setFocusRow(draft.tracking.length);
            }}
          >
            Add tracking number
          </Button>
        </div>
      </div>
    </RecordGroup>
  );
}
