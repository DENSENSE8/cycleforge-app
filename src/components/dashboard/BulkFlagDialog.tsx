'use client';

/** Bulk triage-flag picker for the dashboard selection bar — one flag onto N orders. */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { ORDER_ROW_FLAGS, type OrderRowFlagId } from '@/lib/orders/order-row-flags';
import { cn } from '@/utils/_cn';

interface BulkFlagDialogProps {
  open: boolean;
  /** How many rows the flag will be applied to — shown in the description. */
  count: number;
  saving?: boolean;
  onCancel: () => void;
  /** `null` clears the flag on every selected row. */
  onConfirm: (flag: OrderRowFlagId | null) => void;
}

export function BulkFlagDialog({
  open,
  count,
  saving = false,
  onCancel,
  onConfirm,
}: BulkFlagDialogProps) {
  // `undefined` = nothing picked yet; `null` = the explicit "Clear flag" choice.
  // Collapsing the two would make Confirm fire a clear on an untouched dialog.
  const [choice, setChoice] = useState<OrderRowFlagId | null | undefined>(undefined);

  const close = () => {
    setChoice(undefined);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Flag rows</DialogTitle>
          <DialogDescription>
            {count === 1 ? 'Applies to 1 selected order.' : `Applies to all ${count} selected orders.`}
            {' '}Everyone in the org sees the flag.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col stack-tight" role="radiogroup" aria-label="Triage flag">
          {ORDER_ROW_FLAGS.map((flag) => (
            <button
              key={flag.id}
              type="button"
              role="radio"
              aria-checked={choice === flag.id}
              onClick={() => setChoice(flag.id)}
              className={cn(
                'ds-raw-button flex w-full items-start gap-2 rounded-lg inset-field text-left transition-colors',
                focusRing('control', 'accent'),
                choice === flag.id
                  ? 'bg-surface-accent ring-1 ring-inset ring-border-accent'
                  : 'hover:bg-surface-hover',
              )}
            >
              <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', flag.dotClass)} aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-role-caption font-semibold text-text-default">
                  {flag.label}
                </span>
                <span className="block text-role-micro normal-case tracking-normal text-text-soft">
                  {flag.hint}
                </span>
              </span>
            </button>
          ))}

          <button
            type="button"
            role="radio"
            aria-checked={choice === null}
            onClick={() => setChoice(null)}
            className={cn(
              'ds-raw-button flex w-full items-center gap-2 rounded-lg inset-field text-left transition-colors',
              focusRing('control', 'accent'),
              choice === null
                ? 'bg-surface-accent ring-1 ring-inset ring-border-accent'
                : 'hover:bg-surface-hover',
            )}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-border-default"
              aria-hidden
            />
            <span className="truncate text-role-caption font-semibold text-text-default">
              Clear flag
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => choice !== undefined && onConfirm(choice)}
            disabled={choice === undefined || saving}
            loading={saving}
          >
            {saving ? 'Saving…' : choice === null ? 'Clear flag' : 'Apply flag'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
