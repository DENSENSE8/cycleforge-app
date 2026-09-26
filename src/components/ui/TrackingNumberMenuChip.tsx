'use client';

/** SoT for a filled carrier / scan-ref tracking chip with hover secondary actions. */

import { ExternalLink, Pencil } from '@/components/Icons';
import { TrackingOrSkuScanChip } from '@/components/ui/CopyChip';
import { CopyChipHoverMenu, type CopyChipHoverMenuItem } from '@/components/ui/CopyChipHoverMenu';
import { trackingHoverMenuHasActions } from '@/lib/tables/slot-action-overlay';
import { resolveTrackingOpenUrl } from '@/lib/tracking-format';

interface TrackingNumberMenuChipProps {
  value: string;
  /**
   * Authoritative carrier from the shipment / label (STN `carrier_code`,
   * inbound `row.carrier`). Prefer over regex detect for Open.
   */
  carrierHint?: string | null;
  /** Quiet icon-less face for Sheets-like grids whose header already labels TRACK. */
  plain?: boolean;
  /**
   * Opens the host's edit / replace flow (order inspector, inbound details, …).
   * Omit to hide the Edit menu row — never clipboard-steals.
   */
  onEdit?: () => void;
  /**
   * Extra hover-menu rows after Open / Edit (To-ship **Label**, which opens
   * the paperwork walk on `?paperwork=`). Omit on receiving / inbound chips —
   * those hosts have no walk to open.
   */
  extraItems?: readonly CopyChipHoverMenuItem[];
  onMenuOpenChange?: (open: boolean) => void;
  /** When false, omit any leftover leading glyph (grid column already labeled TRACK). */
  showIcon?: boolean;
  /** Caption-mono face for LedgerGrid Sheets body (never raw text-sm). */
  dense?: boolean;
}

export function TrackingNumberMenuChip({
  value,
  carrierHint = null,
  plain = false,
  onEdit,
  extraItems,
  onMenuOpenChange,
  showIcon,
  dense = false,
}: TrackingNumberMenuChipProps) {
  const raw = String(value || '').trim();
  // Stored/label carrier → pattern detect → official deep link (never Google).
  const trackingUrl = raw ? resolveTrackingOpenUrl(raw, carrierHint) : null;

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

  if (onEdit) {
    items.push({
      id: 'edit-trk',
      label: 'Edit',
      icon: <Pencil />,
      onSelect: () => onEdit(),
    });
  }

  if (extraItems?.length) items.push(...extraItems);

  // No Edit, no Open, no extras → plain chip (copy + dark full-value tooltip).
  if (
    !trackingHoverMenuHasActions({
      trackingUrl,
      hasEdit: Boolean(onEdit),
      extraCount: extraItems?.length ?? 0,
    })
  ) {
    return (
      <TrackingOrSkuScanChip
        value={value}
        plain={plain || showIcon === false}
        dense={dense}
        carrierHint={carrierHint}
      />
    );
  }

  return (
    <CopyChipHoverMenu
      menuLabel="Tracking actions"
      items={items}
      denseLabel
      onOpenChange={onMenuOpenChange}
    >
      <TrackingOrSkuScanChip
        value={value}
        plain={plain || showIcon === false}
        dense={dense}
        carrierHint={carrierHint}
      />
    </CopyChipHoverMenu>
  );
}
