'use client';

/**
 * Column-display control — the SOLE operator entry to `GridColumnDetailsPanel`
 * since chrome Fields was retired (2026-08-02), and since the same day it lives
 * in a **gutter outside the table card**, not inside the header band.
 *
 * ## Two moves, two different reasons
 *
 * 1. **Off page chrome, onto the grid** — Fields mutates the column set of the
 *    card it sat above, so a page-chrome control acting on that card was an
 *    altitude mismatch (and seven surfaces shipped both doors onto one rail).
 * 2. **Off the header band, into a gutter** — parked at the band's right edge it
 *    either reserved a permanent `w-9` track plus `pr-9` (taxing every row of
 *    every grid forever to host an occasional action) or, once that padding was
 *    dropped, it *overlaid the last column's label* — it covered `TRACKING`.
 *    Both are the same mistake in opposite directions: the control was competing
 *    for space that belongs to the data.
 *
 * A gutter settles it. The reserved width is **page** space beside the card, not
 * column space inside it, so no track ever narrows and nothing is ever covered.
 * That is also why this control is plainly visible rather than hover-revealed:
 * hiding it was only ever a way to buy back the width it was stealing, and once
 * it steals none, a hidden control is just a discoverability cost with nothing
 * bought. Mount via {@link GridColumnGutter}.
 */

import { ColumnsThree } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { cn } from '@/utils/_cn';

/**
 * Lays a grid card out beside its column-display gutter.
 *
 * `children` is the framed table card — it stays the flex CHILD (it already
 * carries `flex-1 min-w-0`), so this adds one row wrapper and no extra box
 * inside the card. Honest absence: with no `onOpen`, the card renders alone and
 * no gutter is reserved.
 */
export function GridColumnGutter({
  onOpen,
  open = false,
  children,
}: {
  onOpen?: () => void;
  open?: boolean;
  children: React.ReactNode;
}) {
  if (!onOpen) return <>{children}</>;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 items-stretch gap-2">
      {children}
      {/* Top-aligned into the 44px header band's optical centre — the control
          names the header row, so it should read level with it, not float at
          the card's vertical middle. */}
      <div className="shrink-0 pt-1.5">
        <GridColumnDetailsTrigger onOpen={onOpen} open={open} />
      </div>
    </div>
  );
}

export function GridColumnDetailsTrigger({
  onOpen,
  open = false,
}: {
  onOpen: () => void;
  /** Solid fill while its own rail is showing. */
  open?: boolean;
}) {
  return (
    <div data-grid-column-details-trigger="" data-open={open || undefined}>
      <HoverTooltip label="Column display" asChild>
        <ToolbarButton
          type="button"
          iconOnly
          active={open}
          aria-label="Column display"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={onOpen}
          className={cn(!open && 'text-text-faint hover:text-text-default')}
        >
          <ColumnsThree className="h-3.5 w-3.5 shrink-0" />
        </ToolbarButton>
      </HoverTooltip>
    </div>
  );
}
