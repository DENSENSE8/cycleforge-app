'use client';

/**
 * Scan-station procedure progress control — **SoT** for every Station-contract
 * bench that has a derived procedure.
 *
 * Face: bare {@link ScanStationProgressRing} (no card shell, not GoalRing).
 * Hover: checklist peek (exactly {@link SCAN_STATION_CHECKLIST_PREVIEW_ROWS}
 * rows visible at once — scroll for the rest). Click: toggle the station's
 * procedure Displays surface.
 *
 * Hover is **off** while any right-edge push rail is open (`railOpen`) — the
 * full checklist (or peer column) is already on screen.
 *
 * Domain benches pass percent + preview node + open/close. Unbox adapter:
 * `UnboxScanProgressControl`.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from '@/design-system/primitives';
import { Popover } from '@/design-system/primitives/Popover';
import { useRailHoverPreview } from '@/components/sidebar/rail-shell/useRailHoverPreview';
import { cn } from '@/utils/_cn';
import { ScanStationProgressRing } from './ScanStationProgressRing';

/** How many checklist rows the hover peek shows before scrolling. */
export const SCAN_STATION_CHECKLIST_PREVIEW_ROWS = 2;

export function ScanStationProgressControl({
  percent,
  done,
  total,
  railOpen,
  expanded,
  selected = false,
  onOpen,
  onClose,
  preview,
  ariaLabelOpen,
  ariaLabelClose = 'Hide displays',
  testId = 'scan-station-progress-button',
  previewAriaLabel = 'Procedure checklist preview',
}: {
  /** 0–100 procedure completion for the ring. */
  percent: number;
  done: number;
  total: number;
  /** Any right-edge push open — disables hover peek. */
  railOpen: boolean;
  /** Procedure Displays (or peer) specifically open — drives click toggle + aria. */
  expanded: boolean;
  /** Checklist (or peer procedure display) is the active body — selected face. */
  selected?: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Checklist (or peer procedure list) rendered inside the hover peek. */
  preview: ReactNode;
  /** Aria when the procedure surface is closed (include step counts). */
  ariaLabelOpen?: string;
  ariaLabelClose?: string;
  testId?: string;
  previewAriaLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const previewEnabled = !railOpen;
  const {
    isOpen: previewOpen,
    hoverProps,
    scheduleOpen,
    scheduleClose,
    dismiss,
  } = useRailHoverPreview({
    enabled: previewEnabled,
    openDelay: 180,
    closeDelay: 160,
  });

  // Rail opened under an active peek — tear the peek down immediately.
  useEffect(() => {
    if (railOpen) dismiss();
  }, [railOpen, dismiss]);

  const label = expanded
    ? ariaLabelClose
    : (ariaLabelOpen ??
      `Show checklist · ${done}/${total > 0 ? total : '—'} steps`);

  const onClick = useCallback(() => {
    dismiss();
    if (expanded) onClose();
    else onOpen();
  }, [dismiss, expanded, onClose, onOpen]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      {...(previewEnabled ? hoverProps : {})}
      data-testid="scan-station-progress-control"
    >
      <IconButton
        size="sm"
        tone="neutral"
        ariaLabel={label}
        aria-expanded={expanded || previewOpen}
        aria-pressed={selected}
        aria-haspopup="dialog"
        icon={
          <ScanStationProgressRing
            percent={percent}
            tone={selected ? 'selected' : 'idle'}
          />
        }
        onClick={onClick}
        data-testid={testId}
        data-selected={selected ? 'true' : 'false'}
        className={cn(selected && 'text-text-default')}
      />

      <Popover
        open={previewOpen}
        onClose={dismiss}
        anchorRef={wrapRef}
        placement="bottom-end"
        gap={8}
        padded
        role="dialog"
        aria-label={previewAriaLabel}
        className="w-80 overflow-hidden p-3"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {preview}
      </Popover>
    </div>
  );
}
