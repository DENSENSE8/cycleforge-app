'use client';

/**
 * Append one ops note onto N selected orders — table-foot Notes CTA.
 *
 * Append-only: this does not replace existing notes, and cannot clear them.
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

interface BulkNotesDialogProps {
  open: boolean;
  count: number;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (noteText: string) => void;
}

export function BulkNotesDialog({
  open,
  count,
  saving = false,
  onCancel,
  onConfirm,
}: BulkNotesDialogProps) {
  const [draft, setDraft] = useState('');

  const close = () => {
    setDraft('');
    onCancel();
  };

  const trimmed = draft.trim();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add note</DialogTitle>
          <DialogDescription>
            {count === 1
              ? 'Appends to 1 selected order.'
              : `Appends the same note to all ${count} selected orders.`}{' '}
            Existing notes stay on the trail.
          </DialogDescription>
        </DialogHeader>

        <TextField
          label="Note"
          value={draft}
          onChange={setDraft}
          aria-label="Note"
          multiline
          rows={4}
          maxLength={4000}
          autoFocus
          disabled={saving}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => trimmed && onConfirm(trimmed)}
            disabled={!trimmed || saving}
            loading={saving}
          >
            {saving ? 'Saving…' : 'Add note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
