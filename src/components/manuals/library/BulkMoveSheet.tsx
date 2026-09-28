'use client';

import { Check, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { FolderPathPicker } from '../FolderPathPicker';

/**
 * Bulk-move dialog — opens from the bulk action bar's "Move". Body is just the
 * FolderPathPicker (search + drill-down + new-folder). Uses DS Dialog so the
 * overlay covers the whole viewport, matching the other manual modals.
 */
export function BulkMoveSheet({
  count, target, onTargetChange, busy, onCancel, onConfirm,
}: {
  count: number;
  target: string;
  onTargetChange: (next: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent hideClose className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-border-soft px-4 py-3">
          <div>
            <p className="text-role-micro text-text-soft">Bulk Move</p>
            <DialogTitle className="mt-1 text-sm font-semibold">
              Move {count} manuals
            </DialogTitle>
            <DialogDescription className="sr-only">
              Choose a destination folder for the selected manuals.
            </DialogDescription>
          </div>
          <IconButton
            icon={<X className="h-4 w-4" />}
            onClick={onCancel}
            disabled={busy}
            ariaLabel="Close"
            className="rounded-full border border-border-soft bg-surface-card p-2 hover:border-border-default hover:bg-surface-hover hover:text-text-default"
          />
        </DialogHeader>
        <div className="space-y-4 px-4 py-4">
          <FolderPathPicker value={target} onChange={onTargetChange} />
        </div>
        <DialogFooter className="border-t border-border-hairline bg-surface-canvas/60 px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="sm"
            loading={busy}
            icon={<Check className="h-3.5 w-3.5" />}
            onClick={onConfirm}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
