'use client';

/** Spreadsheet ZOOM — a percentage with a menu, the way a spreadsheet does it. */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Search } from '@/components/Icons';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import {
  DATA_TABLE_TOOLBAR_CORNER,
  DROPDOWN_ITEM_CORNER,
  DROPDOWN_SHELL_CORNER,
} from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * The rungs, as percentages. Coarse on purpose — a continuous slider on a WMS
 * grid is a way to land on a half-pixel row box, and every step here is one an
 * operator can tell apart across the room.
 */
const STEPS = [75, 90, 100, 115, 130] as const;
const STORAGE_KEY = 'cf-grid-density';
const DEFAULT_PERCENT = 100;

function readStored(): number {
  try {
    const raw = Number(window.localStorage.getItem(STORAGE_KEY));
    return STEPS.includes(raw as (typeof STEPS)[number]) ? raw : DEFAULT_PERCENT;
  } catch {
    return DEFAULT_PERCENT;
  }
}

export function DataTableZoomToggle({ className }: { className?: string }) {
  const [percent, setPercent] = useState<number>(DEFAULT_PERCENT);
  const [open, setOpen] = useState(false);

  // After mount only: the server has no localStorage, and painting the stored
  // zoom during SSR would hydrate-mismatch every grid on the page.
  useEffect(() => {
    setPercent(readStored());
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--cf-density', String(percent / 100));
    try {
      window.localStorage.setItem(STORAGE_KEY, String(percent));
    } catch {
      // Site data blocked: the zoom still applies, it just will not survive a reload.
    }
  }, [percent]);

  const pick = useCallback((next: number) => {
    setPercent(next);
    setOpen(false);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="data-table-zoom"
          aria-label={`Zoom, ${percent}%`}
          aria-expanded={open}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center gap-1 px-1.5 text-role-caption',
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            DATA_TABLE_TOOLBAR_CORNER,
            focusRing('control'),
            'text-text-muted hover:bg-surface-hover hover:text-text-default',
            className,
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="tabular-nums">{percent}%</span>
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={2}
        className={cn(DROPDOWN_SHELL_CORNER, 'w-24 overflow-hidden p-0.5')}
      >
        {STEPS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => pick(step)}
            data-testid={`data-table-zoom-${step}`}
            className={cn(
              'ds-raw-button flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-role-caption tabular-nums',
              DROPDOWN_ITEM_CORNER,
              focusRing('control'),
              step === percent
                ? 'bg-surface-sunken font-semibold text-text-default'
                : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
            )}
          >
            {step}%
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
