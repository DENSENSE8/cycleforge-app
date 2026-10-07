'use client';

/**
 * Fulfilled's one body toggle (operator 2026-10-04: layout toggles stay with
 * the records, never the sidebar): the face — Board (the journey board, the
 * default) · Sheet (the Records sheet), `?layout=`. It never changes WHICH
 * orders show; the grain and the columns are the Records sheet's own.
 */

import { SegmentedGlyphSwitch, type SegmentedGlyphOption } from '@/design-system/components/SegmentedGlyphSwitch';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { FULFILLED_COLUMN_PARAM, FULFILLED_LAYOUT_LABEL, FULFILLED_LAYOUT_PARAM, type FulfilledLayout } from '@/lib/outbound/fulfilled-params';

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
 * Board · Sheet — the face on screen, in the URL (`?layout=`; the board is
 * absence). A bucket narrowed to (`?col=`) stays on the sheet, so the same
 * orders stay on screen; the board paints every bucket at once, so choosing
 * it drops the bucket.
 */
export function FulfilledLayoutSwitch({ layout }: { layout: FulfilledLayout }) {
  const replace = useReplaceSearchParams();
  return (
    <SegmentedGlyphSwitch
      options={LAYOUT_OPTIONS}
      value={layout}
      onChange={(next) =>
        replace((params) => {
          if (next === 'sheet') {
            params.set(FULFILLED_LAYOUT_PARAM, next);
          } else {
            params.delete(FULFILLED_LAYOUT_PARAM);
            params.delete(FULFILLED_COLUMN_PARAM);
          }
        })
      }
      ariaLabel="Layout"
      testId="fulfilled-layout"
    />
  );
}
