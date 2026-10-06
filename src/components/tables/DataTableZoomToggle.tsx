'use client';

/**
 * Spreadsheet ZOOM — ONE dropdown whose face is just the percent (`100%▾`),
 * the way a spreadsheet does it (operator 2026-10-05: no − / + buttons).
 * `ZoomMenu` is the face every grid shares: the sheet (`PastedListSheet`,
 * per-layout zoom in `useSheetColumns`) and DataTable (`DataTableZoomToggle`,
 * one stored percent for every grid) hand it their own value, rungs and setter.
 */

import { useEffect, useState } from 'react';
import { Check, ChevronDown } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/** The zoom dropdown: the percent as its face, one item per rung. Presentational — the host owns the value. */
export function ZoomMenu({
  value,
  steps,
  onChange,
  testId,
  className,
}: {
  /** The zoom now, percent. */
  value: number;
  /** The rungs offered, percent, smallest first. */
  steps: readonly number[];
  onChange: (next: number) => void;
  testId?: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <HoverTooltip label="Zoom" asChild>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            ariaLabel={`Zoom, ${value}%`}
            iconRight={<ChevronDown aria-hidden />}
            data-testid={testId}
            // The neighbours' 28px hit box (IconButton `sm`, the toolbar row face).
            className={cn('h-7 shrink-0 gap-0.5 px-1.5 tabular-nums', className)}
          >
            {value}%
          </Button>
        </DropdownMenuTrigger>
      </HoverTooltip>
      <DropdownMenuContent align="end" className="min-w-24">
        {steps.map((step) => (
          <DropdownMenuItem
            key={step}
            role="menuitemradio"
            aria-checked={step === value}
            onSelect={() => onChange(step)}
            data-testid={testId ? `${testId}-${step}` : undefined}
            className={cn('justify-between tabular-nums', step === value && 'font-semibold')}
          >
            {step}%
            {step === value ? <Check aria-hidden className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

/** DataTable's zoom: one stored percent, applied as `--cf-density` on the document. */
export function DataTableZoomToggle({ className }: { className?: string }) {
  const [percent, setPercent] = useState<number>(DEFAULT_PERCENT);

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

  return <ZoomMenu value={percent} steps={STEPS} onChange={setPercent} testId="data-table-zoom" className={className} />;
}
