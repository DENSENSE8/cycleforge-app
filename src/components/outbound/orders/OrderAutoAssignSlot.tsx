'use client';

/**
 * One slot of the listing rule (Picker / Backup picker / Packer / Backup
 * packer) — the Pick / Pack cell's avatar + name face (`LedgerStageAssign`),
 * without the verb or stamp, opening the same staff popover.
 */

import { useRef, useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { stop, UNASSIGNED_MARK_CLASS } from './outbound-orders-ledger-editors';
import { LEDGER_HIT_CLASS } from './outbound-orders-ledger-geometry';

export function OrderAutoAssignSlot({
  label,
  role,
  staffId,
  name,
  invalid,
  disabled,
  onCommit,
}: {
  label: string;
  role: 'technician' | 'packer';
  staffId: number | null;
  name: string | null;
  /** Same person as the slot's primary — painted in the danger tone. */
  invalid: boolean;
  disabled: boolean;
  onCommit: (staffId: number | null, staffName: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="ghost"
        radius="flush"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-label={staffId ? `Change ${label}` : `Set ${label}`}
        data-testid={`auto-assign-slot-${label.toLowerCase().replace(/\s+/g, '-')}`}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={stop}
        className={cn(
          'h-full w-full min-w-0 justify-start gap-1.5 px-1 text-left hover:bg-mode-hover',
          LEDGER_HIT_CLASS,
          focusRing('cell'),
        )}
      >
        {staffId ? (
          <StaffAvatar staffId={staffId} name={name} avatarPhotoId={null} size="xs" colorRing face="record" alt={name ?? undefined} />
        ) : (
          <span aria-hidden className={UNASSIGNED_MARK_CLASS} />
        )}
        <span
          className={cn(
            'min-w-0 truncate text-role-caption',
            invalid ? STATE_TONE_CLASSES.danger.text : staffId ? 'text-mode-ink' : 'text-mode-muted',
          )}
        >
          {staffId ? name : '—'}
        </span>
      </Button>
      <StageStaffAssignPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={label}
        role={role}
        selectedStaffId={staffId}
        onCommit={(id, staffName) => {
          setOpen(false);
          onCommit(id, staffName);
        }}
      />
    </>
  );
}
