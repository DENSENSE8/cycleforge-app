'use client';

/**
 * Which column the Format group acts on.
 *
 * Sheets formats the selected cells; this product's formatting is per column, so
 * the equivalent question is "which column". Making that an explicit control
 * rather than an inference has one concrete advantage over the Sheets gesture:
 * an operator can see, before pressing **B**, exactly what is about to turn
 * bold. The alternative — infer the column from the last cell clicked — reads as
 * magic when it guesses right and as a bug when it guesses wrong, and it would
 * need a `data-col-key` threaded through thirteen families of hand-written cell
 * renderers to guess at all.
 *
 * Empty by default, deliberately: "no column" disables the marks, so a stray
 * keystroke cannot paint a column an operator never chose.
 */

import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { ChevronDown } from '@/components/Icons';
import {
  SHEET_TOOLBAR_GLYPH_CLASS,
  SheetToolbarButton,
} from '@/components/sheet/sheet-toolbar-face';
import type { SheetFormatColumn } from '@/components/sheet/useSheetFormat';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function SheetColumnPicker({
  columns,
  activeColumnKey,
  onSelect,
}: {
  columns: readonly SheetFormatColumn[];
  activeColumnKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = columns.find((c) => c.key === activeColumnKey);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <SheetToolbarButton
          icon={<ChevronDown className={SHEET_TOOLBAR_GLYPH_CLASS} />}
          label={
            active
              ? `Formatting the ${active.label} column`
              : 'Pick a column to format'
          }
          ariaLabel={active ? `Format column: ${active.label}` : 'Pick a column to format'}
          text={active ? active.label : 'Column'}
          active={Boolean(active)}
          aria-expanded={open}
          data-testid="sheet-format-column"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={2}
          className={cn(
            'z-dropdown max-h-72 w-52 overflow-y-auto rounded-lg border border-border-soft bg-surface-card p-0.5 shadow-md ring-1 ring-black/5',
            focusRing('field', 'accent'),
          )}
          data-testid="sheet-format-column-menu"
        >
          {columns.map((column) => (
            <button
              key={column.key}
              type="button"
              onClick={() => {
                onSelect(column.key === activeColumnKey ? null : column.key);
                setOpen(false);
              }}
              aria-pressed={column.key === activeColumnKey}
              className={cn(
                'ds-raw-button w-full truncate rounded px-2 py-1.5 text-left text-role-caption',
                focusRing('control'),
                column.key === activeColumnKey
                  ? 'bg-surface-accent font-semibold text-text-default'
                  : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
              )}
              data-testid={`sheet-format-column-${column.key}`}
            >
              {column.label}
            </button>
          ))}
          {columns.length === 0 ? (
            <p className="px-2 py-1.5 text-role-micro text-text-soft">
              This sheet has no formattable columns.
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
