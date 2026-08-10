'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { Popover } from '@/design-system';
import type { PhotoLibrarySortMode } from '@/lib/photos/library-filter-state';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

const OPTIONS: {
  value: PhotoLibrarySortMode;
  label: string;
  icon: typeof ChevronDown;
}[] = [
  { value: 'recent', label: 'Newest', icon: ChevronUp },
  { value: 'oldest', label: 'Oldest', icon: ChevronDown },
];

/** Right-pane sort dropdown — Newest / Oldest. Same h-8 ToolbarButton shell as media type. */
export function PhotoSortMenu({
  sort,
  onSortChange,
}: {
  sort: PhotoLibrarySortMode;
  onSortChange: (s: PhotoLibrarySortMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const activeOption = OPTIONS.find((o) => o.value === sort) ?? OPTIONS[0];

  const handleSelect = (value: PhotoLibrarySortMode) => {
    if (value !== sort) onSortChange(value);
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
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-option-index="${(index + 1) % OPTIONS.length}"]`)
        ?.focus();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-option-index="${(index - 1 + OPTIONS.length) % OPTIONS.length}"]`)
        ?.focus();
    }
  };

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort: ${activeOption.label}`}
        active={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleButtonKeyDown}
        className="gap-1 normal-case tracking-normal"
      >
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap">{activeOption.label}</span>
        {/* Flips state, never travels — a 150ms rotate on the control the
            operator has already committed to confirms a result that is on
            screen. Colour transitions stay (house hover law); transforms do not. */}
        <ChevronDown className={cn('h-3 w-3 shrink-0 opacity-60', open && 'rotate-180')} />
      </ToolbarButton>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        placement="bottom-start"
        gap={4}
        matchWidth
        padded={false}
        role="listbox"
        aria-label="Sort photos"
        className={cn('min-w-0 p-0.5 shadow-md', cornerClass('flush'))}
      >
        <ul ref={listRef} className="list-none">
          {OPTIONS.map((o, index) => {
            const active = sort === o.value;
            const Icon = o.icon;
            return (
              <li key={o.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-option-index={index}
                  onClick={() => handleSelect(o.value)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  className={cn(
                    'ds-raw-button flex w-full items-center justify-start gap-1.5 py-1.5 pl-1.5 pr-1 text-role-micro font-semibold transition-colors',
                    cornerClass('flush'),
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-blue-600' : 'text-text-default')} />
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}
