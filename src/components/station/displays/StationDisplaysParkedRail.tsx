'use client';

/** @domain-job Station Displays PARKED strip — the Root Index as an icon rail, so a closed column is still one click from any display. */

import type { SectionTab } from '@/design-system/components';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { resolveStationDepth } from '@/design-system/themes/station-depths';
import { resolveStationSkin } from '@/design-system/themes/station-skins';
import { cn } from '@/utils/_cn';
import {
  groupDisplayIndexRows,
  withLookDisplayIndexRow,
  type DisplayIndexRow,
} from './display-index';
import { withLookDisplayTabs } from './look-display-tab';

/** ONE icon-chrome token, shared with the 40px nav beam. */
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
  const lookLabel = `${resolveStationSkin(prefs?.stationSkin).label} · ${resolveStationDepth(prefs?.stationDepth).label}`;
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
