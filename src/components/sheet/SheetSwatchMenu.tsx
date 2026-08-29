'use client';

/**
 * Text / fill colour picker for the Sheets toolbar.
 *
 * Offers exactly the token vocabulary in `column-formats.ts` — six text tones,
 * six fills — and nothing else. There is no custom-colour well and no hex input,
 * deliberately: the palette IS the product's semantic vocabulary, so a column an
 * operator paints red reads as the same red as the status chip beside it, and
 * light/dark stay coherent because the swatch resolves to a semantic alias
 * rather than a literal.
 *
 * A "Clear" row rather than a "none" swatch for text: clearing is an ACTION
 * (return to the inherited colour), while `none` is a legitimate *value* for a
 * fill. Modelling them the same way would make "no fill" and "default text"
 * behave differently under the same-looking control.
 */

import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import {
  SHEET_FILL_SWATCHES,
  SHEET_FILL_SWATCH_KEYS,
  SHEET_TEXT_SWATCHES,
  SHEET_TEXT_SWATCH_KEYS,
} from '@/lib/tables/column-formats';
import { SheetToolbarButton } from '@/components/sheet/sheet-toolbar-face';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function SheetSwatchMenu({
  kind,
  value,
  onSelect,
  disabled,
  trigger,
}: {
  kind: 'text' | 'fill';
  value: string | null;
  onSelect: (swatch: string | null) => void;
  disabled?: boolean;
  trigger: { icon: ReactNode; label: string; testId: string };
}) {
  const swatches = kind === 'text' ? SHEET_TEXT_SWATCHES : SHEET_FILL_SWATCHES;
  const keys = kind === 'text' ? SHEET_TEXT_SWATCH_KEYS : SHEET_FILL_SWATCH_KEYS;

  return (
    <Popover.Root>
      {/*
        `asChild` + `contents` keeps the toolbar button as the flex item — a
        Popover trigger that inserts its own box would reopen the gutters the
        flush chrome grammar closes.
      */}
      <Popover.Trigger asChild disabled={disabled}>
        <SheetToolbarButton
          icon={trigger.icon}
          label={trigger.label}
          active={value != null && value !== 'none'}
          disabled={disabled}
          data-testid={trigger.testId}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={2}
          // Same panel chrome as `WorkbenchFilterPopover` so the toolbar's
          // dropdowns read as one menu family, not three.
          className={cn(
            'z-dropdown w-44 overflow-hidden rounded-lg border border-border-soft bg-surface-card p-1 shadow-md ring-1 ring-black/5',
            focusRing('field', 'accent'),
          )}
        >
          <div className="grid grid-cols-3 gap-1">
            {keys.map((key) => {
              const swatch = swatches[key as keyof typeof swatches];
              const selected = value === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={swatch.label}
                  aria-pressed={selected}
                  onClick={() => onSelect(key)}
                  className={cn(
                    'ds-raw-button flex h-8 items-center justify-center',
                    cornerClass('flush'),
                    focusRing('control'),
                    selected ? 'ring-2 ring-inset ring-blue-600' : 'hover:bg-surface-hover',
                  )}
                  data-testid={`${trigger.testId}-${key}`}
                >
                  <span
                    aria-hidden
                    className={cn('h-4 w-4 border border-border-soft', swatch.swatch)}
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              'ds-raw-button mt-1 w-full px-2 py-1 text-left text-role-caption text-text-soft',
              cornerClass('flush'),
              focusRing('control'),
              'hover:bg-surface-hover hover:text-text-default',
            )}
            data-testid={`${trigger.testId}-clear`}
          >
            Clear
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
