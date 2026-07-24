'use client';

/**
 * Compact queue display-sort dropdown — Priority | Newest | Deadline plus
 * spreadsheet column sorts (Product, Ship by, …). Workbench chrome: quiet
 * control in the trailing CTA cluster (left of Import when present), never a
 * solid TabSwitch beside search. Used by Pending (To Ship) and Testing.
 * Options grow from {@link QUEUE_DISPLAY_SORT_OPTIONS}.
 */

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpDown, ChevronDown } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { Popover } from '@/design-system';
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
}: {
  sort: T;
  onChange: (next: T) => void;
  /** Sort choices; defaults to the Pending / Testing queue vocabulary.
   *  Repair passes its own `REPAIR_DISPLAY_SORT_OPTIONS`. */
  options?: readonly { id: T; label: string; shortLabel: string }[];
  /** Accessible name for the dropdown listbox. */
  ariaLabel?: string;
  className?: string;
}) {
  const opts =
    (options ?? QUEUE_DISPLAY_SORT_OPTIONS) as readonly { id: T; label: string; shortLabel: string }[];
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const activeOption = useMemo(() => opts.find((o) => o.id === sort) ?? opts[0], [opts, sort]);

  const handleSelect = (next: T) => {
    if (next !== sort) onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = opts.length;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-option-index="${(index + 1) % count}"]`)
        ?.focus();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-option-index="${(index - 1 + count) % count}"]`)
        ?.focus();
    }
  };

  return (
    <div className={cn('shrink-0', className)} data-queue-sort-switch="">
      <ToolbarButton
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort by: ${activeOption.label}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleButtonKeyDown}
        className="normal-case tracking-wide"
      >
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap">{activeOption.shortLabel}</span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 opacity-70 transition-transform', open && 'rotate-180')} />
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
        aria-label={ariaLabel}
        className="min-w-[9.5rem] rounded-lg p-0.5 shadow-md"
      >
        <ul ref={listRef} className="list-none">
          {opts.map((o, index) => {
            const active = sort === o.id;
            return (
              <li key={o.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-option-index={index}
                  onClick={() => handleSelect(o.id)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  className={cn(
                    'ds-raw-button flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-role-micro font-semibold transition-colors',
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
                  )}
                >
                  {o.shortLabel}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </div>
  );
}
