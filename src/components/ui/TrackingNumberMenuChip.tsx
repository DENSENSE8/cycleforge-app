'use client';

/**
 * SoT for a filled carrier / scan-ref tracking chip with hover secondary actions.
 *
 * Primary click = copy (via {@link TrackingOrSkuScanChip}). Hover menu:
 *   • Open tracking page — when a carrier URL resolves
 *   • Replace tracking — host opens the order inspector replace flow
 *
 * Orders identity cluster ({@link OrderIdentityChips}) is the sole consumer today;
 * receiving TRACK cells stay plain {@link TrackingChip}.
 */

import { ExternalLink, RefreshCw } from '@/components/Icons';
import { TrackingOrSkuScanChip } from '@/components/ui/CopyChip';
import { CopyChipHoverMenu, type CopyChipHoverMenuItem } from '@/components/ui/CopyChipHoverMenu';
import { getTrackingUrl } from '@/utils/order-links';

interface TrackingNumberMenuChipProps {
  value: string;
  /** Quiet icon-less face for Sheets-like grids whose header already labels TRACK. */
  plain?: boolean;
  /**
   * Opens the host's replace-tracking flow (order inspector + auto-start editor).
   * Omit to hide the Replace menu row — never clipboard-steals.
   */
  onReplaceTracking?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}

export function TrackingNumberMenuChip({
  value,
  plain = false,
  onReplaceTracking,
  onMenuOpenChange,
}: TrackingNumberMenuChipProps) {
  const trackingUrl = value ? getTrackingUrl(value) : null;
  const items: CopyChipHoverMenuItem[] = [];

  if (trackingUrl) {
    items.push({
      id: 'open-trk',
      label: 'Open tracking page',
      icon: <ExternalLink />,
      tone: 'accent',
      onSelect: () => {
        window.open(trackingUrl, '_blank', 'noopener,noreferrer');
      },
    });
  }
  if (onReplaceTracking) {
    items.push({
      id: 'replace-trk',
      label: 'Replace tracking',
      icon: <RefreshCw />,
      onSelect: () => onReplaceTracking(),
    });
  }

  const chip = <TrackingOrSkuScanChip value={value} plain={plain} />;
  if (items.length === 0) return chip;

  return (
    <CopyChipHoverMenu
      menuLabel="Tracking actions"
      items={items}
      onOpenChange={onMenuOpenChange}
    >
      {chip}
    </CopyChipHoverMenu>
  );
}
