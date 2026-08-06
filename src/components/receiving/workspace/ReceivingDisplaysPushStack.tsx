'use client';

/**
 * Unbox Displays — the station-scoped right-edge **push** column that now holds
 * every Unbox display except the carton itself.
 *
 * The scan-progress **ring** lives on the Displays icon plate as
 * {@link UnboxSectionTabs} `rightSlot` (same row, right of the ⋮ overflow) —
 * the face of {@link ScanStationProgressControl}. Checklist stays
 * `stripHidden`; the ring opens it. When Displays is closed, open via `←|`
 * then use the ring. Do not remount a second ring under the dock.
 *
 * Carton `↑ ↓` when this column is open: **top-right of this details panel**
 * (`headerTrailing` → {@link UnboxPushColumn} band). When closed, the cursor
 * lives on {@link ScanStationUtilityRail} with `←|` Open displays. Not
 * CartonContextCard / Photos. Column dismiss stays at the band's **top-left**.
 *
 * Host body uses {@link DISPLAYS_FLUSH_HOST} (`px-0`) — the column IS the card.
 * Topic plate + nested verb strips sit edge-to-edge; content rows opt into
 * {@link DISPLAYS_BODY_INSET}. No `-mx-4` cancel dance.
 */

import type { ReactNode } from 'react';
import type { SectionTab } from '@/design-system/components';
import { DISPLAYS_FLUSH_HOST } from '@/design-system/shells/detail-stack';
import { UnboxSectionTabs } from './line-edit/terminal/unbox-tabs';
import { UnboxPushColumn } from './UnboxPushColumn';

const DISPLAYS_PUSH_STORAGE_KEY = 'unbox-displays-push-width';

export function ReceivingDisplaysPushStack({
  tabs,
  activeTab,
  onTabChange,
  onClose,
  headerTrailing = null,
  rightSlot = null,
  // The visual shell is shared across scan stations (Unbox golden · Arrival ·
  // Testing). These default to the Unbox strings so the Unbox call site is
  // unchanged; a sibling station passes its own so the storage key / aria label
  // / testids don't collide with Unbox's.
  ariaLabel = 'Unbox displays',
  storageKey = DISPLAYS_PUSH_STORAGE_KEY,
  testId = 'receiving-displays-push',
  resizeLabel = 'Resize displays panel',
  resizeTestId = 'unbox-displays-push-resize',
  resizeTooltip = 'Resize displays',
}: {
  tabs: SectionTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onClose: () => void;
  /** Carton ↑↓ at the details panel top-right while Displays is open. */
  headerTrailing?: ReactNode;
  /**
   * Displays strip trailing peer (right of ⋮) — Unbox: procedure progress ring.
   * Optional; stations without a derived procedure leave it empty.
   */
  rightSlot?: ReactNode;
  ariaLabel?: string;
  storageKey?: string;
  testId?: string;
  resizeLabel?: string;
  resizeTestId?: string;
  resizeTooltip?: string;
}) {
  // No per-surface width ceiling — {@link UnboxPushColumn} clamps to frame
  // `capPx` (station center floor 720) so Displays fills leftover beside the
  // locked middle. A hard max (560 / 640 / 1600) used to leave a gray band.
  return (
    <UnboxPushColumn
      ariaLabel={ariaLabel}
      testId={testId}
      storageKey={storageKey}
      resizeLabel={resizeLabel}
      resizeTestId={resizeTestId}
      resizeTooltip={resizeTooltip}
      onClose={onClose}
      headerTrailing={headerTrailing}
    >
      {/* Fill column — no outer scroll. Active display owns height (and may
          pin its own footer). Flush host: plate + verbs edge-to-edge; no pb-*. */}
      <div className={DISPLAYS_FLUSH_HOST}>
        <UnboxSectionTabs
          tabs={tabs}
          value={activeTab}
          onChange={onTabChange}
          rightSlot={rightSlot}
          compact
          fillHeight
        />
      </div>
    </UnboxPushColumn>
  );
}
