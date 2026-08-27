'use client';

/**
 * Compact queue display-sort dropdown — Priority | Newest | Deadline plus
 * spreadsheet column sorts (Product, Days late, …). Workbench chrome: quiet
 * control in the trailing CTA cluster (left of Import when present), never a
 * solid TabSwitch beside search. Used by Pending (To Ship) and Testing.
 * Options grow from {@link QUEUE_DISPLAY_SORT_OPTIONS}.
 *
 * Trigger is {@link WorkbenchBandControl} (28px ops chrome face) — never
 * {@link ToolbarButton}'s `h-8` soft pill, which overflows Band 3.
 * Panel: `ToolbarListbox*` so trailing-cluster dropdowns share one list
 * grammar. Selection is a leading checkmark, never a `bg-blue-50` fill.
 */

import { useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown } from '@/components/Icons';
import {
  WorkbenchBandControl,
  WORKBENCH_BAND_CONTROL_GLYPH_CLASS,
} from '@/components/dashboard/workbench-band-control';
import { Popover } from '@/design-system';
import {
  TOOLBAR_LISTBOX_PANEL_CLASS,
  ToolbarListboxOption,
  toolbarListboxOptionKeyDown,
  toolbarListboxTriggerKeyDown,
} from '@/design-system/primitives';
import {
  QUEUE_DISPLAY_SORT_OPTIONS,
  type QueueDisplaySort,
} from '@/utils/queue-display-sort';
import { cn } from '@/utils/_cn';

export function QueueSortSwitch<T extends string = QueueDisplaySort>({
  sort,
  onChange,
  options,
  ariaLabel = 'Sort queue',
  className,
  variant = 'label',
}: {
  sort: T;
  onChange: (next: T) => void;
  /** Sort choices; defaults to the Pending / Testing queue vocabulary.
   *  Repair passes its own `REPAIR_DISPLAY_SORT_OPTIONS`. */
  options?: readonly { id: T; label: string; shortLabel: string }[];
  /** Accessible name for the dropdown listbox. */
  ariaLabel?: string;
  className?: string;
  /**
   * `label` — shortLabel + caret (Incoming / Testing trailing).
   * `icon` — ArrowUpDown only (To-ship triage; Unbox-parity quiet chrome).
   */
  variant?: 'label' | 'icon';
}) {
  const opts =
    (options ?? QUEUE_DISPLAY_SORT_OPTIONS) as readonly { id: T; label: string; shortLabel: string }[];
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const activeOption = useMemo(() => opts.find((o) => o.id === sort) ?? opts[0], [opts, sort]);

  const dismiss = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleSelect = (next: T) => {
    if (next !== sort) onChange(next);
    dismiss();
  };

  const iconOnly = variant === 'icon';
  const sortLabel = `Sort by: ${activeOption.label}`;

  return (
    <div className={cn('shrink-0', className)} data-queue-sort-switch="" data-variant={variant}>
      <WorkbenchBandControl
        ref={buttonRef}
        label={sortLabel}
        ariaLabel={sortLabel}
        text={iconOnly ? undefined : activeOption.shortLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => toolbarListboxTriggerKeyDown(event, () => setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        icon={
          iconOnly ? (
            <ArrowUpDown className={WORKBENCH_BAND_CONTROL_GLYPH_CLASS} aria-hidden />
          ) : (
            <ChevronDown
              className={cn(
                WORKBENCH_BAND_CONTROL_GLYPH_CLASS,
                'opacity-70 transition-transform',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          )
        }
      />

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        placement="bottom-end"
        gap={4}
        matchWidth={false}
        padded={false}
        role="listbox"
        aria-label={ariaLabel}
        className={TOOLBAR_LISTBOX_PANEL_CLASS}
      >
        <ul ref={listRef} className="list-none">
          {opts.map((o, index) => (
            <li key={o.id} role="none">
              <ToolbarListboxOption
                index={index}
                selected={sort === o.id}
                onClick={() => handleSelect(o.id)}
                onKeyDown={(event) =>
                  toolbarListboxOptionKeyDown(event, index, opts.length, listRef, dismiss)
                }
              >
                {o.label}
              </ToolbarListboxOption>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}
