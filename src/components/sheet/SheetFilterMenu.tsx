'use client';

/**
 * The toolbar's filter control — lit trigger + count, dropdown on click.
 *
 * ## Why this owns its own popover instead of mounting `WorkbenchFilterPopover`
 *
 * The two disagree about exactly one thing: the TRIGGER. `WorkbenchFilterPopover`
 * draws a `ToolbarButton` — a soft `rounded-lg` pill sized for the old Band-3
 * right cluster — and this row's controls are flush-square cubes on the row's own
 * rung. A trigger that wore a different corner and a different height in the
 * middle of twelve peers is the "ragged parade" the band-control face was
 * introduced to end.
 *
 * What it does NOT fork is the **menu**: callers pass
 * `WorkbenchFilterGroupLabel` / `WorkbenchFilterMenuRow` / `WorkbenchFilterDivider`
 * as children, so every filter menu in the product still reads the same inside.
 * The row vocabulary is shared; only the trigger belongs to this row.
 *
 * ## Lit + counted, not a dot
 *
 * Band 3 marked a hot filter with a dot, and its own docblock admits a dot alone
 * fails WCAG 1.4.1 and floor glanceability — which is why surfaces had to render
 * a separate "hot chip" beside the field to compensate. Here the trigger fills
 * solid and prints the number of active refinements, so one control carries the
 * whole fact and there is nothing to keep in sync beside it.
 */

import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { Filter } from '@/components/Icons';
import {
  SHEET_TOOLBAR_GLYPH_CLASS,
  SheetToolbarButton,
} from '@/components/sheet/sheet-toolbar-face';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export interface SheetFilterMenuProps {
  /** Active refinements. > 0 lights the trigger and prints the badge. */
  activeCount: number;
  /** `WorkbenchFilterMenuRow` / `…GroupLabel` / `…Divider`. */
  children: ReactNode;
  /** Clears every refinement. Rendered as a footer row when any are active. */
  onClearAll?: () => void;
  contentClassName?: string;
}

export function SheetFilterMenu({
  activeCount,
  children,
  onClearAll,
  contentClassName,
}: SheetFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const hot = activeCount > 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <SheetToolbarButton
          icon={<Filter className={SHEET_TOOLBAR_GLYPH_CLASS} />}
          label={hot ? `Filters (${activeCount} active)` : 'Filters'}
          ariaLabel={hot ? `Filters, ${activeCount} active` : 'Filters'}
          active={hot}
          count={activeCount}
          aria-expanded={open}
          data-testid="sheet-filter-button"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={2}
          // Same panel chrome as every other workbench filter menu.
          className={cn(
            'z-dropdown overflow-hidden rounded-lg border border-border-soft bg-surface-card p-0.5 shadow-md ring-1 ring-black/5',
            focusRing('field', 'accent'),
            contentClassName ?? 'w-60',
          )}
          data-testid="sheet-filter-menu"
        >
          {children}
          {hot && onClearAll ? (
            <>
              <div className="my-0.5 h-px bg-border-soft" aria-hidden />
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setOpen(false);
                }}
                className={cn(
                  'ds-raw-button w-full rounded px-2 py-1.5 text-left text-role-caption text-text-soft',
                  focusRing('control'),
                  'hover:bg-surface-hover hover:text-text-default',
                )}
                data-testid="sheet-filter-clear-all"
              >
                Clear all filters
              </button>
            </>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
