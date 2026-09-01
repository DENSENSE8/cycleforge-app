'use client';

/**
 * One quantity onto N selected orders — table-foot Qty CTA.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button, TextField } from '@/design-system/primitives';

interface BulkQtyDialogProps {
  open: boolean;
  count: number;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (quantity: string) => void;
}

export function BulkQtyDialog({
  open,
  count,
  saving = false,
  onCancel,
  onConfirm,
}: BulkQtyDialogProps) {
  const [draft, setDraft] = useState('');

  const close = () => {
    setDraft('');
    onCancel();
  };

  const trimmed = draft.trim();
  const valid = trimmed.length > 0 && /^\d+$/.test(trimmed) && Number(trimmed) > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set quantity</DialogTitle>
          <DialogDescription>
            {count === 1
              ? 'Applies to 1 selected order.'
              : `Applies to all ${count} selected orders.`}
          </DialogDescription>
        </DialogHeader>

        <TextField
          label="Qty"
          inputMode="numeric"
          value={draft}
          onChange={setDraft}
          aria-label="Quantity"
          autoFocus
          disabled={saving}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid) {
              event.preventDefault();
              onConfirm(trimmed);
            }
          }}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => valid && onConfirm(trimmed)}
            disabled={!valid || saving}
            loading={saving}
          >
            {saving ? 'Saving…' : 'Set quantity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
