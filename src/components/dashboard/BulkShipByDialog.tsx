'use client';

/**
 * Bulk ship-by picker for the table-foot selection strip — one date onto N orders.
 *
 * Compact DateRangePickerField: month grid, click commits, no X, no year.
 * The dialog only names the batch ("applies to N"); the field owns the day.
 *
 * Writes through `useOrderAssignment`, which already accepts `orderIds[]`.
 */

import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button } from '@/design-system/primitives';
import { localDateToDateKey } from '@/utils/date';

interface BulkShipByDialogProps {
  open: boolean;
  /** How many rows the date will be applied to — shown in the description. */
  count: number;
  saving?: boolean;
  onCancel: () => void;
  /** Receives a civil date key (`YYYY-MM-DD`), never a Date or an instant. */
  onConfirm: (dateKey: string) => void;
}

export function BulkShipByDialog({
  open,
  count,
  saving = false,
  onCancel,
  onConfirm,
}: BulkShipByDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set ship-by date</DialogTitle>
          <DialogDescription>
            {count === 1
              ? 'Applies to 1 selected order.'
              : `Applies to all ${count} selected orders.`}
          </DialogDescription>
        </DialogHeader>

        <DateRangePickerField
          variant="compact"
          value={undefined}
          disabled={saving}
          onChange={(day) => {
            const key = localDateToDateKey(day);
            if (key) onConfirm(key);
          }}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
