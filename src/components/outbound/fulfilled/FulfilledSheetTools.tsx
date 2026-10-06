'use client';

/**
 * Fulfilled's body layout toggles (operator 2026-10-04: layout / display
 * toggles stay with the records, never the sidebar): the page layout — Board
 * (the journey board, the default) · Sheet, `?layout=` — then, on the sheet,
 * the row grain — Orders (every line of a channel order combined) · Lines
 * (one row per order line), `?grain=` — and which optional columns the sheet
 * shows (per browser, beside its widths and zoom). None changes WHICH orders
 * show.
 */

import { useCallback, useEffect, useState } from 'react';
import { ColumnsThree } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SegmentedGlyphSwitch, type SegmentedGlyphOption } from '@/design-system/components/SegmentedGlyphSwitch';
import {
  Checkbox,
  IconButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/design-system/primitives';
import { FULFILLED_COLUMNS, type PastedListColumnKey } from '@/components/search/pasted-list/pasted-list-table';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import {
  FULFILLED_DEFAULT_GRAIN,
  FULFILLED_GRAIN_LABEL,
  FULFILLED_GRAIN_PARAM,
  FULFILLED_LAYOUT_LABEL,
  FULFILLED_LAYOUT_PARAM,
  FULFILLED_STATUS_PARAM,
  type FulfilledGrain,
  type FulfilledLayout,
} from '@/lib/outbound/fulfilled-params';

/** Board: status lanes side by side. */
function BoardGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 4.5v4M10 4.5v7M15 4.5v2.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

/** Sheet: a grid of rows and columns. */
function SheetGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.75 6h16.5M1.75 10.5h16.5M7.5 1.75v12.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

const LAYOUT_OPTIONS: readonly SegmentedGlyphOption<FulfilledLayout>[] = [
  { value: 'board', label: FULFILLED_LAYOUT_LABEL.board, Glyph: BoardGlyph, testId: 'fulfilled-layout-board' },
  { value: 'sheet', label: FULFILLED_LAYOUT_LABEL.sheet, Glyph: SheetGlyph, testId: 'fulfilled-layout-sheet' },
];

/**
 * Board · Sheet — the page layout, in the URL (`?layout=`; the board is
 * absence). The board paints every bucket at once, so choosing it drops the
 * sheet's status chip.
 */
export function FulfilledLayoutSwitch({ layout }: { layout: FulfilledLayout }) {
  const replace = useReplaceSearchParams();
  return (
    <SegmentedGlyphSwitch
      options={LAYOUT_OPTIONS}
      value={layout}
      onChange={(next) =>
        replace((params) => {
          if (next === 'sheet') params.set(FULFILLED_LAYOUT_PARAM, next);
          else {
            params.delete(FULFILLED_LAYOUT_PARAM);
            params.delete(FULFILLED_STATUS_PARAM);
          }
        })
      }
      ariaLabel="Layout"
      testId="fulfilled-layout"
    />
  );
}

/** Orders: one row per order, its lines folded under a bracket. */
function OrdersGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 5.5h12M4 10.5h12" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

/** Lines: one thin row per order line. */
function LinesGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 4.5h12M4 7h12M4 9.5h12M4 12h12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

const GRAIN_OPTIONS: readonly SegmentedGlyphOption<FulfilledGrain>[] = [
  { value: 'order', label: FULFILLED_GRAIN_LABEL.order, Glyph: OrdersGlyph, testId: 'fulfilled-grain-order' },
  { value: 'line', label: FULFILLED_GRAIN_LABEL.line, Glyph: LinesGlyph, testId: 'fulfilled-grain-line' },
];

/** Orders · Lines — the row grain, in the URL (`?grain=`; the default is absence). */
export function FulfilledGrainSwitch({ grain }: { grain: FulfilledGrain }) {
  const replace = useReplaceSearchParams();
  return (
    <SegmentedGlyphSwitch
      options={GRAIN_OPTIONS}
      value={grain}
      onChange={(next) =>
        replace((params) => {
          if (next === FULFILLED_DEFAULT_GRAIN) params.delete(FULFILLED_GRAIN_PARAM);
          else params.set(FULFILLED_GRAIN_PARAM, next);
        })
      }
      ariaLabel="Rows"
      testId="fulfilled-grain"
    />
  );
}

const OPTIONAL_COLUMNS = FULFILLED_COLUMNS.filter((column) => column.tier === 'optional');

/** The optional tracks shown, persisted per browser under the sheet's layout key. Read after mount: the server paints the defaults. */
export function useShownFulfilledColumns(layoutKey: string): [readonly PastedListColumnKey[], (key: PastedListColumnKey) => void] {
  const storageKey = `${layoutKey}:shown`;
  const [shown, setShown] = useState<readonly PastedListColumnKey[]>([]);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(saved)) setShown(OPTIONAL_COLUMNS.map((column) => column.key).filter((key) => saved.includes(key)));
    } catch {
      // A malformed or blocked store shows the default ten.
    }
  }, [storageKey]);
  const toggle = useCallback(
    (key: PastedListColumnKey) =>
      setShown((current) => {
        const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Storage full or blocked: the choice still applies for this visit.
        }
        return next;
      }),
    [storageKey],
  );
  return [shown, toggle];
}

/** Columns (an icon; its word on hover): the optional tracks (SKU · Qty · Customer · … · Claim by) on or off; the default eleven always show. */
export function FulfilledColumnsMenu({
  shown,
  onToggle,
}: {
  shown: readonly PastedListColumnKey[];
  onToggle: (key: PastedListColumnKey) => void;
}) {
  return (
    <DropdownMenu>
      <HoverTooltip label={shown.length > 0 ? `Columns · ${shown.length} more shown` : 'Columns'} asChild>
        <DropdownMenuTrigger asChild>
          <IconButton ariaLabel="Columns" size="sm" icon={<ColumnsThree aria-hidden className="size-4" />} data-fulfilled-columns />
        </DropdownMenuTrigger>
      </HoverTooltip>
      <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel>More columns</DropdownMenuLabel>
        {OPTIONAL_COLUMNS.map((column) => {
          const on = shown.includes(column.key);
          return (
            <DropdownMenuItem
              key={column.key}
              role="menuitemcheckbox"
              aria-checked={on}
              // Stay open: several columns are picked in one visit.
              onSelect={(event) => {
                event.preventDefault();
                onToggle(column.key);
              }}
            >
              <Checkbox checked={on} tabIndex={-1} aria-hidden className="pointer-events-none" />
              {column.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
