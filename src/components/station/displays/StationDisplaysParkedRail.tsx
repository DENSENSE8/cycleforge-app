'use client';

/**
 * @domain-job Station Displays PARKED strip — the Root Index as an icon rail,
 *   so a closed column is still one click from any display.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse `CollapseStripMruPins` (left rail): those pins are
 *   a RECENCY list over feed rows and they select-without-expanding, because a
 *   selected row is legible in the work surface beside them. A display is not —
 *   a leaf needs the column — so this rail is the fixed INDEX and every click
 *   opens. Same 32px strip geometry, different contract.
 *
 * Why it exists at all: the parked strip used to be 32px of empty chrome with a
 * restore button at its foot. That spent a permanent column on one action the
 * whole strip already performs, and it told the operator nothing about what was
 * behind it. The index is the thing they were going to open anyway.
 *
 * Ordering is the Root Index's own (`verification → assets → context`, groups
 * omitted when empty), NOT recency — a fixed rail is reachable by muscle memory
 * and a reordering one is not.
 *
 * **It now gets that order from `groupDisplayIndexRows`, the same function the
 * open list uses (fixed 2026-08-19).** This file used to paint `rows` in raw
 * array order while `StationDisplayIndexList` grouped them, so the parked strip
 * and the open index disagreed about sequence — the same displays in a
 * different order depending on whether the column was open. A docblock claiming
 * "the Root Index's own ordering" is not ordering; calling the grouper is.
 */

import type { SectionTab } from '@/design-system/components';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { resolveStationSkin } from '@/design-system/themes/station-skins';
import { cn } from '@/utils/_cn';
import {
  groupDisplayIndexRows,
  withLookDisplayIndexRow,
  type DisplayIndexRow,
} from './display-index';
import { withLookDisplayTabs } from './look-display-tab';

/**
 * ONE icon-chrome token, shared with the 40px nav beam.
 *
 * `HEADER_ICON_BTN_CLASS` is the GlobalHeader / spine-top-pin face: square,
 * edge-to-edge, `hover:bg-surface-sunken` — the hover DEPTH reads as a plane
 * step behind the glyph rather than a tint on it. A hand-rolled `h-7 w-7` cell
 * with its own hover (the first draft of this file) was a second answer to a
 * question the header already answers, and it left a 2px gutter either side so
 * the wash floated instead of filling the strip.
 *
 * `TOP_CHROME_ICON_FACE` carries the 16px box + the single nav stroke, so a
 * display's glyph here weighs exactly what the same glyph weighs in the header
 * and in the spine.
 */
const PARKED_CELL_CLASS = cn(
  'flex w-full shrink-0 items-center justify-center',
  HEADER_ICON_BTN_CLASS,
);

/** Attention tone leaks through the closed column — an action row still marks. */
const PARKED_ACTION_CLASS = 'text-text-warning';

export function StationDisplaysParkedRail({
  rows,
  tabs,
  onOpenLeaf,
  activeId,
}: {
  /** Root Index rows, already gated + ordered by the host. */
  rows: DisplayIndexRow[];
  /** Leaf registry — icons paint from matching tab ids (same map as the list). */
  tabs: SectionTab[];
  /** Open the column ON this leaf. A display cannot be read while parked. */
  onOpenLeaf: (id: string) => void;
  /** Last opened leaf — marked so returning is aimed, not hunted. */
  activeId?: string | null;
}) {
  const { prefs } = useStaffPreferences();
  const lookLabel = resolveStationSkin(prefs?.stationSkin).label;
  const resolvedRows = withLookDisplayIndexRow(rows, lookLabel);
  const resolvedTabs = withLookDisplayTabs(tabs);
  const iconById = new Map(resolvedTabs.map((t) => [t.id, t.icon]));
  // Flatten the SAME grouped sequence the open index renders, so a display sits
  // at the same ordinal whether the column is parked or open.
  const ordered = groupDisplayIndexRows(resolvedRows).flatMap((section) => section.rows);
  const painted = ordered.filter((row) => iconById.get(row.id));
  if (painted.length === 0) return null;

  return (
    <div
      // `gap-0` — cells abut so the hover wash runs edge-to-edge across the
      // seam, the same reason `SPINE_TOP_PIN_WRAP` refuses `w-8` islands with
      // air between them. A gap here would make every hover a floating chip.
      className="flex min-h-0 w-full flex-col items-stretch gap-0 overflow-y-auto"
      data-displays-parked-rail=""
      // The strip itself restores on click; a cell must not do both.
      onClick={(e) => e.stopPropagation()}
    >
      {painted.map((row) => {
        const Icon = iconById.get(row.id)!;
        const isActive = activeId != null && activeId === row.id;
        return (
          <HoverTooltip key={row.id} label={row.label} asChild focusable={false}>
            <button
              type="button"
              aria-label={row.label}
              data-displays-parked-cell={row.id}
              onClick={(e) => {
                e.stopPropagation();
                onOpenLeaf(row.id);
              }}
              className={cn(
                PARKED_CELL_CLASS,
                'h-8',
                row.tone === 'action' && PARKED_ACTION_CLASS,
                isActive && HEADER_ICON_BTN_OPEN_CLASS,
              )}
            >
              <Icon className={TOP_CHROME_ICON_FACE} />
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}
