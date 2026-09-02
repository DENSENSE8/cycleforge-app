'use client';

/**
 * People combobox — shadcn Command (new-york) + house anchored Popover.
 *
 * Same recipe as IntakeCombobox (CommandInput / CommandList / CommandItem /
 * Check) but the trigger is a table cell or icon, not a form Button, so the
 * shell is design-system Popover (anchorRef), not ui/popover.
 *
 * Assign: name-click. Roster: All staff trailing on CommandInput; each row
 * carries eligibility switches the host named (Picker, Packer, …).
 */

import { useId, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Check, User } from '@/components/Icons';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { IconButton } from '@/design-system/primitives/IconButton';
import { Popover } from '@/design-system/primitives/Popover';
import { Switch } from '@/design-system/primitives/Switch';
import { DROPDOWN_ITEM_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export const ASSIGNEE_COMBOBOX_LIST_CLASS = 'relative max-h-56 min-h-56 overflow-y-auto py-1';

export type AssigneeComboboxFace = {
  id: string;
  label: string;
  checked: boolean;
};

export type AssigneeComboboxRow = {
  id: number;
  name: string;
  leading?: ReactNode;
  selected?: boolean;
  assignable?: boolean;
  faces?: readonly AssigneeComboboxFace[];
};

export type AssigneeComboboxPanelProps = {
  query: string;
  onQueryChange: (value: string) => void;
  rows: readonly AssigneeComboboxRow[];
  loading?: boolean;
  emptyMessage: string;
  roster: boolean;
  showAllStaff?: boolean;
  onAllStaff?: () => void;
  onSelect: (row: AssigneeComboboxRow) => void;
  onFaceChange?: (row: AssigneeComboboxRow, faceId: string, checked: boolean) => void;
  disabled?: boolean;
  listId?: string;
  className?: string;
  onEscape?: () => void;
};

export function AssigneeComboboxPanel({
  query,
  onQueryChange,
  rows,
  loading = false,
  emptyMessage,
  roster,
  showAllStaff = false,
  onAllStaff,
  onSelect,
  onFaceChange,
  disabled = false,
  listId,
  className,
  onEscape,
}: AssigneeComboboxPanelProps) {
  const generatedId = useId();
  const commandId = listId ?? generatedId;

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    }
  };

  return (
    <Command
      shouldFilter={false}
      className={cn('rounded-none bg-surface-card', className)}
      onKeyDown={onListKeyDown}
      id={commandId}
    >
      <CommandInput
        autoFocus
        value={query}
        onValueChange={onQueryChange}
        placeholder="Search staff…"
        disabled={disabled}
        className="text-role-micro text-text-default"
        trailing={
          showAllStaff && onAllStaff ? (
            <IconButton
              type="button"
              size="xs"
              tone="neutral"
              icon={<User className="h-3.5 w-3.5" />}
              ariaLabel="All staff"
              aria-pressed={roster}
              data-testid="stage-staff-all-staff"
              className={cn(
                'shrink-0 hover:bg-surface-hover',
                focusRing('control'),
                roster && 'bg-surface-sunken text-text-default',
              )}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onAllStaff();
              }}
            />
          ) : undefined
        }
      />

      <CommandList className={ASSIGNEE_COMBOBOX_LIST_CLASS} aria-busy={loading || undefined}>
        {!loading && rows.length === 0 ? (
          <CommandEmpty className="px-3 py-4 text-center text-role-eyebrow uppercase tracking-wider text-text-faint">
            {emptyMessage}
          </CommandEmpty>
        ) : null}

        {rows.map((row) => {
          const canAssignHere = !roster && row.assignable !== false;
          return (
            <CommandItem
              key={row.id}
              value={`${row.name} ${row.id}`}
              disabled={disabled || (!canAssignHere && !roster)}
              onSelect={() => {
                if (canAssignHere) onSelect(row);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-2.5 py-1.5 text-left',
                DROPDOWN_ITEM_CORNER,
                canAssignHere ? 'cursor-pointer' : 'cursor-default',
                row.selected && !roster ? 'bg-blue-50 text-blue-700' : 'text-text-default',
              )}
            >
              {row.leading}
              <span className="min-w-0 flex-1 truncate text-role-micro font-medium">
                {row.name}
              </span>
              {roster && row.faces && row.faces.length > 0 ? (
                <span className="flex shrink-0 items-center gap-2">
                  {row.faces.map((face) => (
                    <label
                      key={face.id}
                      className="flex items-center gap-1.5"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="text-role-eyebrow font-semibold uppercase tracking-wider text-text-muted">
                        {face.label}
                      </span>
                      <Switch
                        checked={face.checked}
                        disabled={disabled}
                        aria-label={`${face.label} — ${row.name}`}
                        data-testid="stage-staff-lane-switch"
                        onCheckedChange={(next) => onFaceChange?.(row, face.id, next)}
                      />
                    </label>
                  ))}
                </span>
              ) : (
                <Check
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    row.selected ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden
                />
              )}
            </CommandItem>
          );
        })}
      </CommandList>
    </Command>
  );
}

export type AssigneeComboboxProps = AssigneeComboboxPanelProps & {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  testId?: string;
};

export function AssigneeCombobox({
  open,
  onClose,
  anchorRef,
  label,
  testId = 'stage-staff-assign-popover',
  ...panel
}: AssigneeComboboxProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-start"
      gap={4}
      role="listbox"
      aria-label={panel.roster ? 'Staff roster' : `Assign ${label}`}
      padded={false}
      className="w-[280px]"
      data-testid={testId}
    >
      <AssigneeComboboxPanel {...panel} onEscape={onClose} />
    </Popover>
  );
}
