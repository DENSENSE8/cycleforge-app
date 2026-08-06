'use client';

/**
 * Scan-station procedure progress control — **SoT** for every Station-contract
 * bench that has a derived procedure.
 *
 * Face: bare {@link ScanStationProgressRing} (no card shell, not GoalRing).
 * Placement: **dock-anchored under the terminal** (Unbox: `UnboxDockHost`
 * progress row) — same place whether Displays/push is open or closed.
 *
 * Hover peek: Cursor-style overlap just above the ring (`top-end`,
 * viewport-clamped) with an optional footer to commit the real Displays rail.
 * Hover is **off** while any push rail is open (`railOpen`) — the full
 * checklist is already on screen. Click: toggle the station's procedure
 * Displays surface.
 *
 * Domain benches pass percent + preview node + open/close. Unbox adapter:
 * `UnboxScanProgressControl`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ChevronRight } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { Popover } from '@/design-system/primitives/Popover';
import type { AnchoredPlacement } from '@/design-system/primitives/AnchoredLayer';
import { useRailHoverPreview } from '@/components/sidebar/rail-shell/useRailHoverPreview';
import { cn } from '@/utils/_cn';
import { ScanStationProgressRing } from './ScanStationProgressRing';

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
  // Close names the REGION, not the tab — the ring toggles the whole Station
  // push column, and one control cannot say "Hide displays" when the same edge
  // hosts Ticket/Claim/tool. Matches UnboxDisplaysEdgeToggle's UNBOX_PUSH_CLOSE_LABEL.
  // Law: source-of-truth.md → Displays vs inspector.
  ariaLabelClose = 'Hide right panel',
  testId = 'scan-station-progress-button',
  previewAriaLabel = 'Procedure checklist preview',
  /** Anchored popover placement — SoT for station progress is `top-end`. */
  previewPlacement = 'top-end',
  /** Popover surface classes. */
  previewClassName = 'w-80 p-3',
  previewStyle,
  /**
   * Footer CTA label — opens the procedure Displays in the right rail and
   * dismisses the peek.
   */
  previewRailActionLabel,
}: {
  percent: number;
  done: number;
  total: number;
  railOpen: boolean;
  expanded: boolean;
  selected?: boolean;
  onOpen: () => void;
  onClose: () => void;
  preview: ReactNode;
  ariaLabelOpen?: string;
  ariaLabelClose?: string;
  testId?: string;
  previewAriaLabel?: string;
  previewPlacement?: AnchoredPlacement;
  previewClassName?: string;
  previewStyle?: CSSProperties;
  previewRailActionLabel?: string;
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

  const onOpenInRail = useCallback(() => {
    dismiss();
    onOpen();
  }, [dismiss, onOpen]);

  const hasRailAction = Boolean(previewRailActionLabel);

  const peekBody = hasRailAction ? (
    <div className="flex min-h-0 flex-1 flex-col" data-scan-progress-peek>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{preview}</div>
      <div className="shrink-0 border-t border-border-hairline px-1 py-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between gap-2 font-semibold"
          onClick={onOpenInRail}
          data-testid="scan-station-progress-open-rail"
        >
          <span className="truncate">{previewRailActionLabel}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-soft" />
        </Button>
      </div>
    </div>
  ) : (
    preview
  );

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
        placement={previewPlacement}
        gap={8}
        padded={!hasRailAction}
        role="dialog"
        aria-label={previewAriaLabel}
        className={cn(previewClassName)}
        style={previewStyle}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {peekBody}
      </Popover>
    </div>
  );
}
