'use client';

/**
 * One-shot pick / pack assignment for the table-foot selection strip.
 *
 * Searchable staff comboboxes (full active roster — no present / role filter).
 * Selecting a person (click or Enter) commits that lane onto every selected
 * order immediately via the caller's optimistic `useOrderAssignment` write.
 * No WorkOrder / StaffButtonGrid chrome.
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Button } from '@/design-system/primitives';
import { StaffAvatar } from '@/components/identity';
import { Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';

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

function staffSelectOptions(staff: BulkAssignStaffOption[]) {
  return staff.map((s) => ({
    value: s.id,
    label: s.name,
    data: s,
  }));
}

function StaffOptionFace({
  id,
  name,
  active,
}: {
  id: number;
  name: string;
  active: boolean;
}) {
  return (
    <>
      <StaffAvatar staffId={id} name={name} size="sm" colorRing alt="" />
      <span className="min-w-0 flex-1 truncate text-role-micro font-medium">{name}</span>
      <Check
        className={cn('h-3.5 w-3.5 shrink-0', active ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      />
    </>
  );
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
  const roster = Array.isArray(staffOptions) ? staffOptions : [];
  const options = staffSelectOptions(roster);

  useEffect(() => {
    if (!open) {
      setTesterId(null);
      setPackerId(null);
    }
  }, [open]);

  const close = () => {
    setTesterId(null);
    setPackerId(null);
    onCancel();
  };

  const commitPick = (id: string | number | null) => {
    if (id == null || saving) return;
    const staffId = Number(id);
    const name = roster.find((s) => s.id === staffId)?.name;
    if (!Number.isFinite(staffId) || !name) return;
    setTesterId(staffId);
    onConfirm({ testerId: staffId, testerName: name });
  };

  const commitPack = (id: string | number | null) => {
    if (id == null || saving) return;
    const staffId = Number(id);
    const name = roster.find((s) => s.id === staffId)?.name;
    if (!Number.isFinite(staffId) || !name) return;
    setPackerId(staffId);
    onConfirm({ packerId: staffId, packerName: name });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign pick / pack</DialogTitle>
          <DialogDescription>
            {count === 1
              ? 'Search a name and press Enter — applies to 1 selected order.'
              : `Search a name and press Enter — applies to all ${count} selected orders.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <SearchableSelectField
            label="Pick"
            value={testerId}
            onChange={commitPick}
            options={options}
            placeholder="Search staff…"
            searchPlaceholder="Type a name…"
            emptyMessage={roster.length === 0 ? 'No staff' : 'No matches'}
            disabled={saving}
            ariaLabel="Assign pick"
            testId="bulk-assign-pick"
            renderOption={(opt, { active }) => (
              <StaffOptionFace
                id={Number(opt.value)}
                name={opt.label}
                active={active || testerId === Number(opt.value)}
              />
            )}
          />
          <SearchableSelectField
            label="Pack"
            value={packerId}
            onChange={commitPack}
            options={options}
            placeholder="Search staff…"
            searchPlaceholder="Type a name…"
            emptyMessage={roster.length === 0 ? 'No staff' : 'No matches'}
            disabled={saving}
            ariaLabel="Assign pack"
            testId="bulk-assign-pack"
            renderOption={(opt, { active }) => (
              <StaffOptionFace
                id={Number(opt.value)}
                name={opt.label}
                active={active || packerId === Number(opt.value)}
              />
            )}
          />
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
