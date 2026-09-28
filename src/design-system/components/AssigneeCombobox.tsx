'use client';

/**
 * People combobox — shadcn Command (new-york) + house anchored Popover.
 * The search does NOT take focus on mount (operator 2026-09-23). It used to
 */

import { useId, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Check, Pencil } from '@/components/Icons';
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
import { cornerClass, DROPDOWN_ITEM_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const ASSIGNEE_COMBOBOX_LIST_CLASS = 'relative max-h-56 min-h-56 overflow-y-auto py-1';

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

type AssigneeComboboxPanelProps = {
  query: string;
  onQueryChange: (value: string) => void;
  rows: readonly AssigneeComboboxRow[];
  loading?: boolean;
  emptyMessage: string;
  roster: boolean;
  /** Present ⇒ the trailing pencil toggles roster mode. */
  onEditRoster?: () => void;
  /** Accessible name for the pencil — e.g. Edit pickers. */
  editRosterLabel?: string;
  onSelect: (row: AssigneeComboboxRow) => void;
  onFaceChange?: (row: AssigneeComboboxRow, faceId: string, checked: boolean) => void;
  /** Square row faces — set by the flush {@link AssigneeCombobox} shell. */
  flushRows?: boolean;
  disabled?: boolean;
  listId?: string;
  className?: string;
  onEscape?: () => void;
  /** Painted above search — e.g. Assign picker. Never a standing keycap. */
  heading?: string;
  /**
   * Trailing 1…n badges on assign rows. Empty search + digit commits that
   * index (visible order). The digit path reads the LIST's keydown, so it
   * works whether or not the search holds focus.
   */
  numbered?: boolean;
  /** Put the cursor in search as the panel mounts — set by the popover shell, never the inline mobile panel. */
  autoFocusSearch?: boolean;
};

export function AssigneeComboboxPanel({
  query,
  onQueryChange,
  rows,
  loading = false,
  emptyMessage,
  roster,
  onEditRoster,
  editRosterLabel = 'Edit staff',
  onSelect,
  onFaceChange,
  flushRows = false,
  disabled = false,
  listId,
  className,
  onEscape,
  heading,
  numbered = false,
  autoFocusSearch = false,
}: AssigneeComboboxPanelProps) {
  const generatedId = useId();
  const commandId = listId ?? generatedId;

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (!numbered || roster || disabled) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (query.trim()) return;
    const idx = Number(event.key) - 1;
    if (idx < 0 || idx >= rows.length) return;
    const row = rows[idx];
    if (!row || row.assignable === false) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(row);
  };

  return (
    <Command
      shouldFilter={false}
      className={cn('overflow-hidden rounded-none bg-surface-card', className)}
      onKeyDown={onListKeyDown}
      id={commandId}
    >
      {heading ? (
        <p className="px-2.5 pt-1.5 pb-0.5 text-role-micro font-semibold text-text-muted">
          {heading}
        </p>
      ) : null}
      <CommandInput
        value={query}
        onValueChange={onQueryChange}
        placeholder="Search staff…"
        disabled={disabled}
        autoFocus={autoFocusSearch}
        className="text-role-micro text-text-default"
        trailing={
          onEditRoster ? (
            <IconButton
              type="button"
              size="sm"
              tone="neutral"
              radius="flush"
              icon={<Pencil className="h-3.5 w-3.5" />}
              ariaLabel={editRosterLabel}
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
                onEditRoster();
              }}
            />
          ) : undefined
        }
      />

      <CommandList className={ASSIGNEE_COMBOBOX_LIST_CLASS} aria-busy={loading || undefined}>
        {!loading && rows.length === 0 ? (
          <CommandEmpty className="px-3 py-4 text-center text-role-eyebrow text-text-faint">
            {emptyMessage}
          </CommandEmpty>
        ) : null}

        {rows.map((row, index) => {
          const canAssignHere = row.assignable !== false;
          const hotkey = numbered && !roster ? String(index + 1) : null;
          return (
            <CommandItem
              key={row.id}
              value={`${row.name} ${row.id}`}
              disabled={disabled || (!canAssignHere && !roster)}
              onSelect={() => {
                if (canAssignHere) onSelect(row);
              }}
              className={cn(
                'flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left',
                flushRows ? cornerClass('flush') : DROPDOWN_ITEM_CORNER,
                canAssignHere ? 'cursor-pointer' : 'cursor-default',
                row.selected ? 'bg-surface-sunken text-text-default' : 'text-text-default',
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
                      <span className="text-role-eyebrow font-semibold text-text-muted">
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
              ) : hotkey ? (
                <span
                  className="min-w-5 shrink-0 rounded-md bg-surface-sunken px-1.5 text-center text-role-micro font-semibold tabular-nums text-text-muted"
                  aria-hidden
                >
                  {hotkey}
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

type AssigneeComboboxProps = AssigneeComboboxPanelProps & {
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
      gap={0}
      role="listbox"
      aria-label={panel.roster ? 'Staff roster' : `Assign ${label}`}
      padded={false}
      className={cn('w-[280px]', cornerClass('flush'))}
      data-testid={testId}
    >
      <AssigneeComboboxPanel {...panel} flushRows autoFocusSearch onEscape={onClose} />
    </Popover>
  );
}
