'use client';

/** SoT for a filled carrier / scan-ref tracking chip with hover secondary actions. */

import { Copy, ExternalLink, Pencil } from '@/components/Icons';
import { getLast8, TrackingOrSkuScanChip } from '@/components/ui/CopyChip';
import { CopyChipHoverMenu, type CopyChipHoverMenuItem } from '@/components/ui/CopyChipHoverMenu';
import { trackingHoverMenuHasActions } from '@/lib/tables/slot-action-overlay';
import {
  resolveTrackingOpenUrl,
  searchableTrackingNumber,
} from '@/lib/tracking-format';
import type { PortalSideMenuPlacement } from '@/lib/ui/portal-anchor';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';

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
  /** Records show the searchable carrier number; tables retain the last-eight face. */
  face?: 'last8' | 'searchable';
  /** Tables fly right; detail records can deliberately place actions above. */
  menuPlacement?: PortalSideMenuPlacement;
  /** Set false when the host already paints its own always-visible open action. */
  openInMenu?: boolean;
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
  face = 'last8',
  menuPlacement = 'auto',
  openInMenu = true,
}: TrackingNumberMenuChipProps) {
  const raw = String(value || '').trim();
  // Carrier barcodes sometimes wrap the searchable number in a routing
  // envelope (USPS 420 + ZIP, FedEx GS1 96…). Preserve that raw scan for
  // audit/full-copy while exposing the canonical carrier-searchable number.
  const shortened = searchableTrackingNumber(raw);
  const trackingDisplay = face === 'searchable' ? (shortened ?? raw) : undefined;
  // Stored/label carrier → pattern detect → official deep link (never Google).
  const trackingUrl = raw ? resolveTrackingOpenUrl(shortened ?? raw, carrierHint) : null;

  const items: CopyChipHoverMenuItem[] = [];

  items.push({
    id: 'copy-full-trk',
    label: 'Copy full tracking number',
    icon: <Copy />,
    onSelect: () => {
      void copyToClipboard(raw, { historyKind: 'tracking', historyDisplay: getLast8(raw) }).then((ok) =>
        ok ? toast.success('Full tracking number copied') : toast.error('Could not copy tracking number'),
      );
    },
  });

  if (shortened) {
    items.push({
      id: 'copy-short-trk',
      label: `Copy shortened tracking number · ${shortened.slice(0, 2)}…`,
      icon: <Copy />,
      onSelect: () => {
        void copyToClipboard(shortened, { historyKind: 'tracking', historyDisplay: getLast8(shortened) }).then((ok) =>
          ok ? toast.success('Shortened tracking number copied') : toast.error('Could not copy tracking number'),
        );
      },
    });
  }

  if (openInMenu) {
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
  }

  if (onEdit) {
    items.push({
      id: 'edit-trk',
      label: 'Edit',
      icon: <Pencil />,
      onSelect: () => onEdit(),
    });
  }

  if (extraItems?.length) items.push(...extraItems);

  // Preserve the plain fast path only if copy is unavailable as well.
  if (
    !raw &&
    !trackingHoverMenuHasActions({
      trackingUrl: openInMenu ? trackingUrl : null,
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
        trackingDisplay={trackingDisplay}
      />
    );
  }

  return (
    <CopyChipHoverMenu
      menuLabel="Tracking actions"
      items={items}
      denseLabel
      onOpenChange={onMenuOpenChange}
      placement={menuPlacement}
      align={menuPlacement === 'top' || menuPlacement === 'bottom' ? 'center' : 'start'}
    >
      <TrackingOrSkuScanChip
        value={value}
        plain={plain || showIcon === false}
        dense={dense}
        carrierHint={carrierHint}
        trackingDisplay={trackingDisplay}
        disableTooltip
      />
    </CopyChipHoverMenu>
  );
}
