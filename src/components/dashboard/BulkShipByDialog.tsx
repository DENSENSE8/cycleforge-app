'use client';

/**
 * Bulk ship-by picker for the dashboard selection bar — one date onto N orders.
 *
 * A dialog rather than a bar-anchored popover on purpose: `ContextualSelectionBar`
 * renders an icon-only capsule and exposes no anchor for a floating layer, and
 * teaching it to would grow a shared primitive's public API for one call site.
 * Picking a date for a batch is also a deliberate, blocking choice — the one
 * shape a modal is actually right for.
 *
 * Writes through the shared `useOrderAssignment` waist, which already accepts
 * `orderIds[]`; there is no bulk-only endpoint to add.
 */

import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button } from '@/design-system/primitives';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';

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
  const [dateKey, setDateKey] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDateKey(null);
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set ship-by date</DialogTitle>
          <DialogDescription>
            {count === 1 ? 'Applies to 1 selected order.' : `Applies to all ${count} selected orders.`}
          </DialogDescription>
        </DialogHeader>

        {/* Calendar widgets round-trip through the local frame on BOTH sides —
            never a zoned formatter or toISOString() for civil day logic. */}
        <Calendar
          mode="single"
          selected={dateKey ? dateKeyToLocalDate(dateKey) : undefined}
          onSelect={(next?: Date) => setDateKey(next ? localDateToDateKey(next) : null)}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => dateKey && onConfirm(dateKey)}
            disabled={!dateKey || saving}
            loading={saving}
          >
            {saving ? 'Saving…' : 'Set date'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
