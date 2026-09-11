'use client';

/**
 * One-shot pick / pack assignment for the table-foot selection strip.
 *
 * Staff combobox is {@link StageStaffAssignPopover} (AssigneeCombobox + StaffAvatar).
 * Selecting a person commits that lane onto every selected order immediately.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button } from '@/design-system/primitives';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import { getStaffName } from '@/utils/staff';

export type BulkAssignChoice = {
  testerId?: number;
  testerName?: string;
  packerId?: number;
  packerName?: string;
};

export type BulkAssignStaffOption = {
  id: number;
  name: string;
};

interface BulkAssignDialogProps {
  open: boolean;
  count: number;
  saving?: boolean;
  /** Full active staff roster — both lanes share the same list. */
  staffOptions: BulkAssignStaffOption[];
  onCancel: () => void;
  /** Fired as soon as a lane picks a person (optimistic host write). */
  onConfirm: (choice: BulkAssignChoice) => void;
}

export function BulkAssignDialog({
  open,
  count,
  saving = false,
  staffOptions = [],
  onCancel,
  onConfirm,
}: BulkAssignDialogProps) {
  const [testerId, setTesterId] = useState<number | null>(null);
  const [packerId, setPackerId] = useState<number | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const pickRef = useRef<HTMLButtonElement>(null);
  const packRef = useRef<HTMLButtonElement>(null);
  const roster = Array.isArray(staffOptions) ? staffOptions : [];

  useEffect(() => {
    if (!open) {
      setTesterId(null);
      setPackerId(null);
      setPickOpen(false);
      setPackOpen(false);
    }
  }, [open]);

  const close = () => {
    setTesterId(null);
    setPackerId(null);
    onCancel();
  };

  const nameOf = (id: number | null) => {
    if (id == null) return '';
    return roster.find((s) => s.id === id)?.name || getStaffName(id);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign pick / pack</DialogTitle>
          <DialogDescription>
            {count === 1
              ? 'Search a name — applies to 1 selected order.'
              : `Search a name — applies to all ${count} selected orders.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-role-eyebrow uppercase tracking-wider text-text-muted">Pick</span>
            <Button
              ref={pickRef}
              type="button"
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              disabled={saving}
              aria-haspopup="listbox"
              aria-expanded={pickOpen}
              ariaLabel="Assign pick"
              data-testid="bulk-assign-pick"
              onClick={() => setPickOpen(true)}
            >
              {testerId != null ? (
                <span className="flex min-w-0 items-center gap-2">
                  <StaffAvatar staffId={testerId} name={nameOf(testerId)} size="sm" colorRing alt="" />
                  <span className="truncate">{nameOf(testerId)}</span>
                </span>
              ) : (
                'Search staff…'
              )}
            </Button>
            <StageStaffAssignPopover
              open={pickOpen}
              onClose={() => setPickOpen(false)}
              anchorRef={pickRef}
              label="Assign pick"
              role="technician"
              selectedStaffId={testerId}
              onCommit={(staffId, staffName) => {
                if (staffId == null || saving) return;
                setTesterId(staffId);
                onConfirm({ testerId: staffId, testerName: staffName ?? nameOf(staffId) });
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-role-eyebrow uppercase tracking-wider text-text-muted">Pack</span>
            <Button
              ref={packRef}
              type="button"
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              disabled={saving}
              aria-haspopup="listbox"
              aria-expanded={packOpen}
              ariaLabel="Assign pack"
              data-testid="bulk-assign-pack"
              onClick={() => setPackOpen(true)}
            >
              {packerId != null ? (
                <span className="flex min-w-0 items-center gap-2">
                  <StaffAvatar staffId={packerId} name={nameOf(packerId)} size="sm" colorRing alt="" />
                  <span className="truncate">{nameOf(packerId)}</span>
                </span>
              ) : (
                'Search staff…'
              )}
            </Button>
            <StageStaffAssignPopover
              open={packOpen}
              onClose={() => setPackOpen(false)}
              anchorRef={packRef}
              label="Assign pack"
              role="packer"
              selectedStaffId={packerId}
              onCommit={(staffId, staffName) => {
                if (staffId == null || saving) return;
                setPackerId(staffId);
                onConfirm({ packerId: staffId, packerName: staffName ?? nameOf(staffId) });
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
