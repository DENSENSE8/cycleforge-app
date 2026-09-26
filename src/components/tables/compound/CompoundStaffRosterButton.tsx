'use client';

/** Far-right actions-column trigger: */

import { useRef, useState } from 'react';
import { User } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { StageStaffAssignPopover } from './StageStaffAssignPopover';

export function CompoundStaffRosterButton({ label }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="relative inline-flex shrink-0">
      <IconButton
        ref={triggerRef}
        type="button"
        size="sm"
        tone="neutral"
        icon={<User className="h-3.5 w-3.5" />}
        ariaLabel={label ? `Staff for ${label}` : 'Staff roster'}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="compound-staff-roster-trigger"
        className={cn('hover:bg-surface-hover', focusRing('control'))}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((next) => !next);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <StageStaffAssignPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label="Staff"
        role="all"
        selectedStaffId={null}
      />
    </span>
  );
}
