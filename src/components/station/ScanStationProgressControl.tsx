'use client';

/**
 * Scan-station procedure progress control — **SoT** for every Station-contract
 * bench that has a derived procedure.
 *
 * Face: bare {@link ScanStationProgressRing} (no card shell, not GoalRing).
 *
 * **`variant="strip"`** (Unbox Displays): plate cell matching the icon-rail
 * `rightSlot` peer (h-10 w-10, centered, same idle/selected underline as ⋮ /
 * topic cells). Click opens/switches the `stripHidden` checklist body; when
 * already selected, stays on checklist (column dismiss is `→|`). Closed
 * Displays opens via `←|`.
 *
 * **`variant="default"`**: compact IconButton — hover peek + click toggles
 * open/close (legacy dock / closed-rail call sites).
 *
 * Hover peek is **off** while any push rail is open (`railOpen`). Domain
 * benches pass percent + preview node + open/close. Unbox adapter:
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
import {
  SECTION_TAB_ICON_CELL_ACTIVE_CLASS,
  SECTION_TAB_ICON_CELL_IDLE_CLASS,
  SECTION_TAB_ICON_OVERFLOW_CELL_CLASS,
} from '@/design-system/components/SectionTabsSlider';
import { Button, IconButton } from '@/design-system/primitives';
import { Popover } from '@/design-system/primitives/Popover';
import type { AnchoredPlacement } from '@/design-system/primitives/AnchoredLayer';
import { focusRing } from '@/design-system/tokens/focus-ring';
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
  // Close names the REGION, not the tab — default variant toggles the whole
  // Station push column. Strip variant never closes (→| does). Law:
  // source-of-truth.md → Displays vs inspector.
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
  /**
   * `strip` — Displays icon-plate `rightSlot` cell (centered h-10 peer of ⋮).
   * `default` — compact IconButton with hover peek.
   */
  variant = 'default',
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
  variant?: 'default' | 'strip';
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const strip = variant === 'strip';
  const previewEnabled = !strip && !railOpen;
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

  const openLabel =
    ariaLabelOpen ?? `Show checklist · ${done}/${total > 0 ? total : '—'} steps`;
  const label = strip
    ? selected
      ? `Checklist · ${done}/${total > 0 ? total : '—'} steps`
      : openLabel
    : expanded
      ? ariaLabelClose
      : openLabel;

  const onClick = useCallback(() => {
    dismiss();
    if (strip) {
      // Strip: select + show procedure. Column dismiss stays on →|.
      onOpen();
      return;
    }
    if (expanded) onClose();
    else onOpen();
  }, [dismiss, strip, expanded, onClose, onOpen]);

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

  const ring = (
    <ScanStationProgressRing
      percent={percent}
      tone={selected ? 'selected' : 'idle'}
    />
  );

  return (
    <div
      ref={wrapRef}
      className={cn('relative', strip && 'flex h-10 shrink-0 items-stretch')}
      {...(previewEnabled ? hoverProps : {})}
      data-testid="scan-station-progress-control"
    >
      {strip ? (
        // ds-raw-button: Displays icon-plate peer of ⋮ (SectionTabsSlider density=icon)
        <button
          type="button"
          aria-label={label}
          aria-pressed={selected}
          aria-current={selected ? 'page' : undefined}
          onClick={onClick}
          data-testid={testId}
          data-selected={selected ? 'true' : 'false'}
          className={cn(
            SECTION_TAB_ICON_OVERFLOW_CELL_CLASS,
            focusRing('control', 'accent'),
            selected
              ? SECTION_TAB_ICON_CELL_ACTIVE_CLASS
              : SECTION_TAB_ICON_CELL_IDLE_CLASS,
          )}
        >
          {ring}
        </button>
      ) : (
        <IconButton
          size="sm"
          tone="neutral"
          ariaLabel={label}
          aria-expanded={expanded || previewOpen}
          aria-pressed={selected}
          aria-haspopup="dialog"
          icon={ring}
          onClick={onClick}
          data-testid={testId}
          data-selected={selected ? 'true' : 'false'}
          className={cn(selected && 'text-text-default')}
        />
      )}

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
