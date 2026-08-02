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
 * icon-only `ToolbarButton` + `Popover` in the workbench **trailing** cluster —
 * never a solid `TabSwitch` beside search. This is the sibling of
 * {@link QueueSortSwitch} and deliberately shares its listbox anatomy.
 *
 * Toggles persist to `staff_preferences.tableColumns[tableId]` as a delta
 * (`hidden` for core opt-outs, `shown` for optional opt-ins) via
 * {@link useGridFields} — optimistic, cross-device, rolled back on failure.
 *
 * **Add a column** opens the shared column-details right rail (same panel as
 * the LedgerGrid header lip).
 */

import { useRef, useState } from 'react';
import { ColumnsThree, Plus, RotateCcw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { GridColumnDetailsPanel } from '@/components/ui/table-column-config/GridColumnDetailsPanel';
import { Popover } from '@/design-system';
import {
  TOOLBAR_LISTBOX_PANEL_CLASS,
  ToolbarListboxOption,
  toolbarListboxOptionKeyDown,
  toolbarListboxTriggerKeyDown,
} from '@/design-system/primitives';
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsInitialKey, setDetailsInitialKey] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  if (fields.length === 0) return null;

  const fieldsLabel =
    dirtyCount > 0 ? `Fields — ${dirtyCount} changed from default` : 'Fields';

  const dismiss = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const optionCount = 1 + fields.length + (dirtyCount > 0 ? 1 : 0);

  const openDetails = (initialHideKey?: string | null) => {
    setOpen(false);
    setDetailsInitialKey(initialHideKey ?? null);
    setDetailsOpen(true);
  };

  return (
    <div className={cn('shrink-0', className)} data-grid-fields-menu="">
      <HoverTooltip label={fieldsLabel} asChild>
        <ToolbarButton
          ref={buttonRef}
          type="button"
          iconOnly
          active={open || detailsOpen}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={fieldsLabel}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(event) => toolbarListboxTriggerKeyDown(event, () => setOpen(true))}
          className="normal-case tracking-wide"
        >
          <ColumnsThree className="h-3.5 w-3.5 shrink-0" />
        </ToolbarButton>
      </HoverTooltip>

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
        className={TOOLBAR_LISTBOX_PANEL_CLASS}
      >
        <ul ref={listRef} className="list-none">
          <li role="none" className="mb-0.5 border-b border-border-soft pb-0.5">
            <ToolbarListboxOption
              index={0}
              icon={<Plus className="h-3.5 w-3.5 shrink-0" />}
              dataAttrs={{ 'data-add-column': '' }}
              onClick={() => {
                const firstHidden = fields.find((f) => !f.visible)?.key ?? null;
                openDetails(firstHidden);
              }}
              onKeyDown={(event) =>
                toolbarListboxOptionKeyDown(event, 0, optionCount, listRef, dismiss)
              }
            >
              Add a column
            </ToolbarListboxOption>
          </li>
          {fields.map((field, index) => {
            const optionIndex = index + 1;
            return (
              <li key={field.key} role="none">
                <ToolbarListboxOption
                  index={optionIndex}
                  selected={field.visible}
                  dataAttrs={{ 'data-field-key': field.key }}
                  onClick={() => setFieldVisible(field.key, !field.visible)}
                  onKeyDown={(event) =>
                    toolbarListboxOptionKeyDown(
                      event,
                      optionIndex,
                      optionCount,
                      listRef,
                      dismiss,
                    )
                  }
                >
                  {field.label}
                </ToolbarListboxOption>
              </li>
            );
          })}
          {dirtyCount > 0 ? (
            <li role="none" className="mt-0.5 border-t border-border-soft pt-0.5">
              <ToolbarListboxOption
                index={1 + fields.length}
                icon={<RotateCcw className="h-3.5 w-3.5 shrink-0" />}
                onClick={() => reset()}
                onKeyDown={(event) =>
                  toolbarListboxOptionKeyDown(
                    event,
                    1 + fields.length,
                    optionCount,
                    listRef,
                    dismiss,
                  )
                }
              >
                Reset to default
              </ToolbarListboxOption>
            </li>
          ) : null}
        </ul>
      </Popover>

      <GridColumnDetailsPanel
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsInitialKey(null);
        }}
        tableId={tableId}
        columns={columns}
        initialHideKey={detailsInitialKey}
      />
    </div>
  );
}
