'use client';

/**
 * Unbox Displays — the station-scoped right-edge **push** column that now holds
 * every Unbox display except the carton itself.
 *
 * Lane E moved the workbench tab strip here: `overview` stayed and became the
 * whole centre (capture stack → PO lines → label preview), and
 * `classify · listings · units · po-note · checklist · support · tracking ·
 * timeline` plus the PO-pairing pencil moved into this column.
 *
 * It composes {@link UnboxPushColumn}, so it is a PEER of Ticket / Claim / tool
 * push — **not** a `RightRailHost` occupant. The right slot stays single-
 * occupancy and `detail:receiving` keeps the float host; LineEditPanel enforces
 * the mutual exclusion.
 *
 * The tab bar is the same {@link UnboxSectionTabs} / `SectionTabsSlider` the
 * workbench used, so a moved tab renders the same body with the same handlers —
 * and the overflow ⋯ keeps the strip usable at push-column width.
 */

import type { ReactNode } from 'react';
import type { SectionTab } from '@/design-system/components';
import { UnboxSectionTabs } from './line-edit/terminal/unbox-tabs';
import { UnboxPushColumn } from './UnboxPushColumn';

const DISPLAYS_PUSH_STORAGE_KEY = 'unbox-displays-push-width';
/**
 * Wider ceiling than Ticket (480): the Support hub, the tracking editor and the
 * classify checklist all carry two-column rows at ~560.
 */
const DISPLAYS_PUSH_MAX_WIDTH_PX = 560;

export function ReceivingDisplaysPushStack({
  tabs,
  activeTab,
  onTabChange,
  rightSlot,
  onClose,
}: {
  tabs: SectionTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Context control pinned right of the strip — the PO-pairing pencil. */
  rightSlot?: ReactNode;
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
      <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-3">
        <UnboxSectionTabs
          tabs={tabs}
          value={activeTab}
          onChange={onTabChange}
          rightSlot={rightSlot}
        />
      </div>
    </UnboxPushColumn>
  );
}
