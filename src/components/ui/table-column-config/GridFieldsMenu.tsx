'use client';

/**
 * `GridFieldsMenu` — the per-staff column picker for a Workbench spreadsheet.
 *
 * Generated ENTIRELY from the grid's descriptor: a column is offered iff it
 * carries a `hideKey`, so `select` / `title` can never be turned off and a new
 * column shows up here the moment it is added to the column SoT. There is no
 * per-surface list to maintain and no way for the menu to drift from the grid.
 *
 * House chrome laws (`.cursor/rules/workbench-sort-chrome.mdc`): a quiet
 * `ToolbarButton` + `Popover` in the workbench **trailing** cluster — never a
 * solid `TabSwitch` beside search. This is the sibling of {@link QueueSortSwitch}
 * and deliberately shares its trigger/listbox anatomy.
 *
 * Toggles persist to `staff_preferences.tableColumns[tableId]` as a delta
 * (`hidden` for core opt-outs, `shown` for optional opt-ins) via
 * {@link useGridFields} — optimistic, cross-device, rolled back on failure.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ColumnsThree, RotateCcw } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { Popover } from '@/design-system';
import { useGridFields } from '@/design-system/components/grid';
import type { LedgerGridColumnModel } from '@/design-system/components/grid';
import type { TableId } from '@/lib/tables/table-columns';
import { cn } from '@/utils/_cn';

export function GridFieldsMenu<C extends LedgerGridColumnModel>({
  tableId,
  columns,
  className,
}: {
  /** Staff-prefs identity for this grid. */
  tableId: TableId;
  /** The descriptor's FULL canonical column list (never pre-filtered). */
  columns: readonly C[];
  className?: string;
}) {
  const { fields, setFieldVisible, reset, dirtyCount } = useGridFields(tableId, columns);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // A grid whose columns are all structural has nothing to offer — render
  // nothing rather than an empty popover.
  if (fields.length === 0) return null;

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = fields.length;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? (index + 1) % count : (index - 1 + count) % count;
      listRef.current?.querySelector<HTMLButtonElement>(`[data-option-index="${next}"]`)?.focus();
    }
  };

  return (
    <div className={cn('shrink-0', className)} data-grid-fields-menu="">
      <ToolbarButton
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          dirtyCount > 0 ? `Fields — ${dirtyCount} changed from default` : 'Fields'
        }
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleButtonKeyDown}
        className="normal-case tracking-wide"
      >
        <ColumnsThree className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap">Fields</span>
        {dirtyCount > 0 ? (
          <span className="rounded bg-surface-sunken px-1 text-role-micro font-black tabular-nums text-text-muted">
            {dirtyCount}
          </span>
        ) : null}
        <ChevronDown
          className={cn('h-3 w-3 shrink-0 opacity-70 transition-transform', open && 'rotate-180')}
        />
      </ToolbarButton>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        placement="bottom-end"
        gap={4}
        matchWidth={false}
        padded={false}
        role="listbox"
        aria-label="Grid fields"
        className="min-w-[11rem] rounded-lg p-0.5 shadow-md"
      >
        <ul ref={listRef} className="list-none">
          {fields.map((field, index) => (
            <li key={field.key} role="none">
              {/* ds-raw-button: mirrors QueueSortSwitch's listbox option anatomy. */}
              <button
                type="button"
                role="option"
                aria-selected={field.visible}
                data-option-index={index}
                data-field-key={field.key}
                // Keep the menu OPEN across toggles — curating columns is a
                // multi-step task; close-per-click would make it a chore.
                onClick={() => setFieldVisible(field.key, !field.visible)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                className={cn(
                  'ds-raw-button flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-role-micro font-semibold transition-colors',
                  field.visible
                    ? 'text-text-default hover:bg-surface-sunken'
                    : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
                )}
              >
                <Check
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-blue-600',
                    field.visible ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="truncate">{field.label}</span>
              </button>
            </li>
          ))}
          {dirtyCount > 0 ? (
            <li role="none" className="mt-0.5 border-t border-border-soft pt-0.5">
              {/* ds-raw-button: same listbox option anatomy, reset affordance. */}
              <button
                type="button"
                onClick={() => reset()}
                className="ds-raw-button flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-role-micro font-semibold text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-default"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                <span>Reset to default</span>
              </button>
            </li>
          ) : null}
        </ul>
      </Popover>
    </div>
  );
}
