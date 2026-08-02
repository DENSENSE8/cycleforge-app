'use client';

/**
 * Unbox Displays — the station-scoped right-edge **push** column that now holds
 * every Unbox display except the carton itself.
 *
 * The scan-progress **ring** stays **pane-anchored** (same top-right corner open
 * or closed) — it is the toggle that opens this column, so it cannot be gated on
 * the column being open. The `close · up · down` cursor trio beside it is
 * rail-scoped and mounts only while a push column is up, so this header's top
 * inset reserves the full cluster's band whenever it is the open occupant. The
 * ⋯ overflow stays flush with the column's right edge.
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
 * Top inset on the strip header — reserves the pane-anchored utility row
 * (`↑ ↓ ×` + scan-progress ring) as a band ABOVE the strip.
 *
 * Derived: that cluster is `absolute top-2` on the pane host and one
 * `IconButton` sm tall (28px), so it occupies y 8…36 measured from the same
 * host box the Displays column starts at. `pt-9` (36px) puts the strip row at
 * y 44 — an 8px gap under it.
 *
 * **Top, never right.** A right inset (`pr-7`) also cleared the cluster, but it
 * did so by holding a dead gutter open on the strip's own row, which pushed the
 * PO pencil inward from the column edge it belongs on. The cluster is a
 * different row, so it should cost a different axis.
 *
 * `-mr-1` pulls the row 4px past the scroll container's `px-4`, which is exactly
 * the internal padding of the trailing `xs` `IconButton` (24px box, 14px glyph).
 * That lands the GLYPH on the 16px gutter instead of the button's invisible box
 * — optically flush right, which is what "flush" means for an icon button. A
 * button whose border actually touched the card edge would read as clipped.
 */
const DISPLAYS_STRIP_HEADER_CLASS = 'pt-9 -mr-1';

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
      collapseLabel="Hide displays"
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
