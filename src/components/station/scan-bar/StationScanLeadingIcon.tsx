'use client';

import type { ReactNode } from 'react';
import { ScanBarcode, Search } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STATION_SCAN_BAR_DEFAULT_ICON_CLASS } from './tokens';
import type { StationScanStance } from './scan-stance';

interface StationScanLeadingIconProps {
  stance: StationScanStance;
  /**
   * Omitted when the host wired no `previewLookup` — a bar that cannot preview
   * must not offer the stance, or the toggle arms a mode that silently eats the
   * next scan. Absent = render the glyph, not a control.
   */
  onToggle?: () => void;
  /** Custom glyph for scan stance. Preview always uses Search. */
  scanIcon?: ReactNode;
}

const COPY: Record<
  StationScanStance,
  { tooltip: string; ariaLabel: string }
> = {
  scan: {
    tooltip: 'Scan — commits on Enter',
    ariaLabel: 'Scan stance — commits on Enter. Click for Preview.',
  },
  preview: {
    tooltip: 'Preview — decode only, no write',
    ariaLabel: 'Preview stance — decode only, no write. Click for Scan.',
  },
};

/**
 * Left icon = Preview | Scan stance. Type lives on the right rail, not here.
 *
 * SECONDARY fields only (`hotkey={false}`): a bare click-to-toggle glyph.
 * Primary station bars render {@link ScanHotkeyControl} in this slot instead —
 * one dropdown carrying Scan · Preview · focus · Edit hotkey.
 */
export function StationScanLeadingIcon({
  stance,
  onToggle,
  scanIcon,
}: StationScanLeadingIconProps) {
  const copy = COPY[stance];
  const glyph =
    stance === 'preview' ? (
      <Search className={`${STATION_SCAN_BAR_DEFAULT_ICON_CLASS} transition-colors`} />
    ) : (
      (scanIcon ?? (
        <ScanBarcode className={`${STATION_SCAN_BAR_DEFAULT_ICON_CLASS} transition-colors`} />
      ))
    );

  // No toggle wired = the stance is not this bar's to change. Render the glyph
  // as decoration rather than a dead button an operator can press.
  if (!onToggle) {
    return (
      <span className="inline-flex size-[17px] items-center justify-center leading-none">
        {glyph}
      </span>
    );
  }

  return (
    <HoverTooltip label={copy.tooltip} asChild>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={stance === 'preview'}
        aria-label={copy.ariaLabel}
        className="ds-raw-button inline-flex size-[17px] items-center justify-center leading-none"
      >
        {glyph}
      </button>
    </HoverTooltip>
  );
}
