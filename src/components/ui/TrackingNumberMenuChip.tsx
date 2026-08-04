'use client';

/**
 * SoT for a filled carrier / scan-ref tracking chip with hover secondary actions.
 *
 * Carton-context parity ({@link IdentityLinkChip} tracking slot):
 *   • Chip click = copy (via {@link TrackingOrSkuScanChip})
 *   • Hover → white menu below: **Open** (carrier page) · **Edit** (host opens
 *     the order-inspector replace flow)
 *   • Dense uppercase verbs + ExternalLink / Pencil — same face as Unbox
 *
 * Orders identity cluster ({@link OrderIdentityChips}) is the sole consumer today;
 * receiving TRACK cells stay plain {@link TrackingChip}.
 */

import { ExternalLink, Pencil } from '@/components/Icons';
import { TrackingOrSkuScanChip } from '@/components/ui/CopyChip';
import { CopyChipHoverMenu, type CopyChipHoverMenuItem } from '@/components/ui/CopyChipHoverMenu';
import { getTrackingUrl, getTrackingUrlByCarrier } from '@/lib/tracking-format';

interface TrackingNumberMenuChipProps {
  value: string;
  /** Quiet icon-less face for Sheets-like grids whose header already labels TRACK. */
  plain?: boolean;
  /**
   * Opens the host's replace-tracking flow (order inspector + auto-start editor).
   * Omit to hide the Edit menu row — never clipboard-steals.
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
  const raw = String(value || '').trim();
  // Same fallback as TrackingNumberRow / carton: known carrier URL, else a
  // tracking-number web search so Open is never a dead row on a filled chip.
  const trackingUrl = raw
    ? (getTrackingUrl(raw) ?? getTrackingUrlByCarrier(raw, ''))
    : null;

  const items: CopyChipHoverMenuItem[] = [];

  items.push({
    id: 'open-trk',
    label: 'Open',
    icon: <ExternalLink />,
    tone: 'accent',
    disabled: !trackingUrl,
    onSelect: () => {
      if (!trackingUrl) return;
      window.open(trackingUrl, '_blank', 'noopener,noreferrer');
    },
  });

  if (onReplaceTracking) {
    items.push({
      id: 'edit-trk',
      label: 'Edit',
      icon: <Pencil />,
      onSelect: () => onReplaceTracking(),
    });
  }

  // No Edit and no usable Open → plain chip (copy + dark full-value tooltip).
  if (!onReplaceTracking && !trackingUrl) {
    return <TrackingOrSkuScanChip value={value} plain={plain} />;
  }

  return (
    <CopyChipHoverMenu
      menuLabel="Tracking actions"
      items={items}
      denseLabel
      onOpenChange={onMenuOpenChange}
    >
      <TrackingOrSkuScanChip value={value} plain={plain} />
    </CopyChipHoverMenu>
  );
}
