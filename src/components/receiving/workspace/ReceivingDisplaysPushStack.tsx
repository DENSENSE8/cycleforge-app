'use client';

/**
 * Unbox Displays — the station-scoped right-edge **push** column that now holds
 * every Unbox display except the carton itself.
 *
 * The scan-progress **ring** is **dock-anchored** under the terminal
 * (`UnboxDockHost` progress row) — same place open or closed — it is the toggle
 * that opens this column, so it cannot be gated on the column being open. The
 * `↑ ↓` carton cursor stays pane-anchored top-right and is not rail-scoped
 * (2026-08-02): it steps the CARTON, which exists whether or not a column is up.
 * This column's own dismiss lives at its **top-left**, in the shell's header
 * band. The ⋯ overflow stays flush with the column's right edge.
 *
 * There is no `rightSlot`: the PO-pairing pencil that used to live there was
 * deleted on 2026-08-02 when Package Pairing became a display of its own. A
 * tab's selected-ness IS its open state, so a separate toggle beside the strip
 * would be a second flag to keep in sync.
 */

import type { SectionTab } from '@/design-system/components';
import { UnboxSectionTabs } from './line-edit/terminal/unbox-tabs';
import { UnboxPushColumn } from './UnboxPushColumn';

const DISPLAYS_PUSH_STORAGE_KEY = 'unbox-displays-push-width';
const DISPLAYS_PUSH_MAX_WIDTH_PX = 560;

/**
 * `-ml-2` is the strip's half of the OPTICAL gutter the band adopted on
 * 2026-08-02 (`UnboxPushColumn` → `UNBOX_PUSH_TOP_BAND`, which holds the
 * measurements and the reasoning).
 *
 * The cells are glyphs in 26px boxes (`ICON_CELL_COMPACT_CLASS` — `px-1.5` + a
 * 14px glyph), so a box sitting on the `px-4` content edge draws its mark ~7px
 * inside it. That is why the strip's icons stood right of the display card's own
 * left border directly beneath them (ink 24.2 against a border at 17) even
 * though every box in the column was on one column. Pulling the row 8px lands
 * the ink at ~16.2 — the border's line, and the band's `→|` within a pixel.
 *
 * It moves the ROW, so the selected cell's `bg-surface-sunken` wash overhangs
 * the gutter by the same 8px. That is the correct trade and the same one the
 * trailing `-mr-4` already makes: a hit box (and its wash) may bleed past the
 * content edge; the mark the operator reads may not sit off it.
 *
 * `-mr-4` cancels the scroll container's `px-4` for this row ONLY, so the strip's
 * trailing `⋮` sits flush with the column's right edge.
 *
 * Measured 2026-08-02 (Playwright @1440, 420px column): pulling the row the full
 * 16px puts the `⋮` box flush to the edge; its 26px box around a 14px glyph is a
 * 6px inset. (Historically this also lined up with a pane-anchored progress ring
 * that shared the corner; the ring moved under the dock on 2026-08-03 — the
 * flush-edge rationale for `⋮` stands on its own.)
 *
 * **The `pt-9` that used to lead this class is gone.** It held open a 36px band
 * for the pane-anchored cluster to float over; that band is now a real row owned
 * by {@link UnboxPushColumn} (`UNBOX_PUSH_TOP_BAND`), carrying the column's own
 * dismiss at its left. Keeping the inset here would reserve the band twice and
 * push the strip 36px below where it has always sat.
 *
 * **Top, never right — still true for the BAND.** A right inset (`pr-7`) also
 * cleared the old floating cluster, but it did so by holding a dead gutter open
 * on the strip's own row, which pushed the trailing control inward from the
 * column edge it belongs on. This `-mr-4` is the opposite move: it removes a
 * gutter to reach that edge rather than adding one to avoid it.
 */
const DISPLAYS_STRIP_HEADER_CLASS = '-ml-2 -mr-4';

export function ReceivingDisplaysPushStack({
  tabs,
  activeTab,
  onTabChange,
  onClose,
}: {
  tabs: SectionTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <UnboxPushColumn
      ariaLabel="Unbox displays"
      testId="receiving-displays-push"
      storageKey={DISPLAYS_PUSH_STORAGE_KEY}
      maxWidthPx={DISPLAYS_PUSH_MAX_WIDTH_PX}
      resizeLabel="Resize displays panel"
      resizeTestId="unbox-displays-push-resize"
      resizeTooltip="Drag to resize displays · double-click for default"
      onClose={onClose}
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 pb-2 pt-0">
        <UnboxSectionTabs
          tabs={tabs}
          value={activeTab}
          onChange={onTabChange}
          headerClassName={DISPLAYS_STRIP_HEADER_CLASS}
          compact
        />
      </div>
    </UnboxPushColumn>
  );
}
