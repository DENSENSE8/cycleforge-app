'use client';

/** Shared behavior for the id-chip family (`@/components/ui/CopyChip`): */
import { KeyboardEvent, MouseEvent, MutableRefObject, useCallback, useEffect, useId, useRef } from 'react';
import { useSiteTooltipOptional } from '@/components/providers/SiteTooltipProvider';
import { formatTrackingTooltipLabel } from '@/lib/carrier-brand';
import { formatPlatformTooltipLabel } from '@/lib/source-platform';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import { recordCopy } from '@/lib/clipboard-history';
import { writeClipboardText } from '@/lib/clipboard';

interface ChipTooltipAnchor {
  /** Attach to the chip's outer wrapper — the tooltip positions off this rect. */
  chipRef: MutableRefObject<HTMLDivElement | null>;
  /** False when no `SiteTooltipProvider` is mounted (fall back to a `title` attr). */
  hasTooltipProvider: boolean;
  openTooltip: () => void;
  closeTooltip: () => void;
  closeTooltipImmediate: () => void;
}

interface ChipTooltipInternals extends ChipTooltipAnchor {
  anchorId: string;
  tooltipCtxRef: MutableRefObject<ReturnType<typeof useSiteTooltipOptional>>;
}

/** Tooltip-anchor wiring for a chip: */
export function useChipTooltip({
  enabled,
  tooltipValue,
  tooltipAction = 'copy',
}: {
  enabled: boolean;
  tooltipValue: string;
  tooltipAction?: 'copy' | 'external-link';
}): ChipTooltipInternals {
  const anchorId = useId();
  const chipRef = useRef<HTMLDivElement | null>(null);
  const tooltipCtx = useSiteTooltipOptional();
  const tooltipCtxRef = useRef(tooltipCtx);
  tooltipCtxRef.current = tooltipCtx;

  const getRect = useCallback(() => chipRef.current?.getBoundingClientRect() ?? null, []);

  useEffect(() => {
    return () => {
      tooltipCtxRef.current?.closeNow(anchorId);
    };
  }, [anchorId]);

  const openTooltip = () => {
    if (!enabled || !tooltipCtx) return;
    tooltipCtx.activate({ anchorId, value: tooltipValue, getRect, action: tooltipAction });
  };

  const closeTooltip = () => {
    tooltipCtx?.scheduleClose(anchorId);
  };

  const closeTooltipImmediate = () => {
    tooltipCtx?.closeNow(anchorId);
  };

  return {
    chipRef,
    anchorId,
    tooltipCtxRef,
    hasTooltipProvider: !!tooltipCtx,
    openTooltip,
    closeTooltip,
    closeTooltipImmediate,
  };
}

interface CopyChipBehavior extends ChipTooltipAnchor {
  /** Trimmed copy payload; `''` when the value is an empty-display sentinel. */
  normalizedValue: string;
  /**
   * Site-tooltip / native-title label — tracking includes carrier prefix
   * (`FedEx 8751…`); id includes platform prefix (`eBay 08-…`) when known;
   * equals {@link normalizedValue} otherwise.
   */
  tooltipLabel: string;
  canCopy: boolean;
  /** Disable the button only when copy is wanted but there is nothing to copy. */
  isDisabled: boolean;
  handleCopy: (e: MouseEvent<HTMLButtonElement>) => void;
  /** ⌘/Ctrl+C while focused — copies the full value (not the truncated face). */
  handleKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  /** Right-click — secondary copy (no browser menu); richer menus stay on hover SoTs. */
  handleContextMenu: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Show / refresh the site tooltip bubble (copy flash or external-link preview). */
  flashTooltip: () => void;
  /** Open the site tooltip without the copied flash (external-link preview). */
  showTooltipPreview: () => void;
}

/**
 * Full copy-chip behavior: normalized value, copy gating, clipboard write with
 * the tooltip's "Copied" flash, and hover-tooltip wiring whose bubble shows the
 * value about to be copied (kept in sync if the value changes while open).
 */
export function useCopyChip({
  value,
  disableCopy = false,
  disableTooltip = false,
  tooltipTrigger = 'hover',
  onCopy,
  historyKind,
  historyDisplay,
  tooltipAction = 'copy',
  carrierHint = null,
  platformLabel = null,
}: {
  value: string | null | undefined;
  disableCopy?: boolean;
  disableTooltip?: boolean;
  /** `click` — bubble only on chip click (pairs with a separate hover action menu). */
  tooltipTrigger?: 'hover' | 'click';
  /** Called after a successful clipboard write. Use for side-effects (e.g. dispatch a custom event). */
  onCopy?: (value: string) => void;
  /** Chip tone, logged to the device clipboard history for typed re-rendering. */
  historyKind?: string;
  /** Short chip label, logged to the device clipboard history. */
  historyDisplay?: string;
  /** Trailing icon in the hover bubble — external-link for open-in-tab chips. */
  tooltipAction?: 'copy' | 'external-link';
  /**
   * Authoritative carrier for tracking tooltips (`FedEx 8751…`). Same ladder as
   * Open URL / carrier identity. Ignored unless `historyKind === 'tracking'`.
   */
  carrierHint?: string | null;
  /**
   * Catalog-resolved platform display name for id tooltips (`eBay 08-…`).
   * Ignored unless `historyKind === 'id'`.
   */
  platformLabel?: string | null;
}): CopyChipBehavior {
  const normalizedValue = normalizeCopyText(value);
  const canCopy = !disableCopy && !!normalizedValue && normalizedValue !== '---';
  const isDisabled = !canCopy && !disableCopy;
  const tooltipValue =
    historyKind === 'tracking'
      ? formatTrackingTooltipLabel(normalizedValue, carrierHint)
      : historyKind === 'id'
        ? formatPlatformTooltipLabel(normalizedValue, platformLabel)
        : normalizedValue;
  // Id chips may show a catalog platform face with an empty copy payload
  // (unfound peek placeholder) — still allow the platform-name tooltip.
  const tooltipEnabled =
    !disableTooltip &&
    (!!normalizedValue && normalizedValue !== '---'
      ? true
      : historyKind === 'id' && !!tooltipValue);

  const { anchorId, tooltipCtxRef, chipRef, ...tooltip } = useChipTooltip({
    enabled: tooltipEnabled,
    tooltipValue,
    tooltipAction,
  });

  const getRect = useCallback(() => chipRef.current?.getBoundingClientRect() ?? null, [chipRef]);

  useEffect(() => {
    tooltipCtxRef.current?.syncValueIfActive(anchorId, tooltipValue);
  }, [canCopy, anchorId, tooltipValue, tooltipCtxRef]);

  useEffect(() => {
    if (!canCopy) {
      tooltipCtxRef.current?.closeNow(anchorId);
    }
  }, [canCopy, anchorId, tooltipCtxRef]);

  const flashTooltip = () => {
    if (disableTooltip || !tooltipCtxRef.current) return;
    const ctx = tooltipCtxRef.current;
    if (!ctx.isActiveAnchor(anchorId)) {
      // `force`: a copy must show ITS receipt even while another chip's
      // receipt is still holding the bubble — otherwise the second copy in a
      // row would be parked behind the first and report nothing.
      ctx.activate({ anchorId, value: tooltipValue, getRect, action: tooltipAction, force: true });
    }
    ctx.notifyCopied(anchorId);
  };

  const showTooltipPreview = () => {
    if (disableTooltip || !tooltipCtxRef.current) return;
    if (!tooltipValue) return;
    if (
      (!normalizedValue || normalizedValue === '---') &&
      !(historyKind === 'id' && tooltipValue)
    ) {
      return;
    }
    tooltipCtxRef.current.activate({
      anchorId,
      value: tooltipValue,
      getRect,
      action: tooltipAction,
    });
  };

  const performCopy = () => {
    if (!canCopy) return false;
    // `writeClipboardText`, never `navigator.clipboard` directly:
    if (!writeClipboardText(normalizedValue)) return false;
    recordCopy(normalizedValue, { kind: historyKind, display: historyDisplay });
    onCopy?.(normalizedValue);
    return true;
  };

  const notifyCopiedUi = () => {
    if (tooltipTrigger === 'click') {
      flashTooltip();
      return;
    }
    if (tooltipCtxRef.current?.isActiveAnchor(anchorId)) {
      tooltipCtxRef.current.notifyCopied(anchorId);
      return;
    }
    flashTooltip();
  };

  /** Click-to-copy. */
  const handleCopy = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (performCopy()) notifyCopiedUi();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'c') return;
    if (!canCopy) return;
    e.preventDefault();
    e.stopPropagation();
    if (performCopy()) notifyCopiedUi();
  };

  const handleContextMenu = (e: MouseEvent<HTMLButtonElement>) => {
    if (!canCopy) return;
    e.preventDefault();
    e.stopPropagation();
    if (performCopy()) notifyCopiedUi();
  };

  return {
    ...tooltip,
    chipRef,
    normalizedValue,
    tooltipLabel: tooltipValue,
    canCopy,
    isDisabled,
    handleCopy,
    handleKeyDown,
    handleContextMenu,
    flashTooltip,
    showTooltipPreview,
  };
}
