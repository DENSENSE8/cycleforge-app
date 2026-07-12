'use client';

import { Clipboard, Copy, ExternalLink } from '@/components/Icons';
import {
  OrderIdChip,
  OrderIdChipPlaceholder,
  TrackingOrSkuScanChip,
  PlatformChip,
  getLast4,
} from '@/components/ui/CopyChip';
import { ChipColumns, CHIP_COL, type ChipColumn } from '@/components/ui/ChipColumns';
import { CopyChipHoverMenu, type CopyChipHoverMenuItem } from '@/components/ui/CopyChipHoverMenu';
import { dashboardOrderRowChipsClass } from '@/lib/dashboard-order-row-layout';
import { useClipboardHistory, recordCopy } from '@/lib/clipboard-history';
import { getTrackingUrl } from '@/utils/order-links';
import { normalizeCopyText } from '@/lib/copy-chip-format';

/**
 * The platform · order-id · tracking chip cluster shared by the dashboard
 * order-row tables (unshipped queue, shipped, packer, tech).
 *
 * Hover menus (unbox IdentityLinkChip pattern via {@link CopyChipHoverMenu}):
 *   • Platform — primary **copy listing URL**; hover: Open listing · Copy
 *   • Order id — primary **copy**; hover: Copy · Open on platform
 *   • Tracking filled — primary **copy**; hover: Copy · Open tracking
 *   • Tracking empty — paste last in-app tracking clipboard entry when present
 */
export interface OrderIdentityChipsProps {
  platformLabel: string;
  /** Icon color for the platform chip (gray when not linkable). */
  platformIconClass: string;
  /** Underline color for the platform chip. */
  platformBorderClass: string;
  /** Product/listing URL; primary action is **copy**, open is secondary. */
  productPageUrl: string | null;
  /** Marketplace order detail URL (secondary open on order chip). */
  marketplaceOrderUrl?: string | null;
  /** FBA orders carry no platform chip — the column stays empty for alignment. */
  isFba: boolean;
  orderId: string;
  /** SKU-source rows hide the order-id chip (placeholder keeps columns aligned). */
  hideOrderId: boolean;
  /** Raw tracking / scan ref; when empty the paste / trackingAction shows. */
  tracking: string;
  /** Action node for the empty tracking slot when no clipboard tracking (e.g. Add TRK#). */
  trackingAction?: React.ReactNode;
  /** Optional callback when operator pastes clipboard tracking into empty slot. */
  onPasteTracking?: (tracking: string) => void;
  /** Optional 4th column — serial chip on station (Tech) rows. */
  serialChip?: React.ReactNode;
  isMobile: boolean;
}

function openExternal(href: string | null | undefined) {
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

function copyValue(value: string, kind?: string, display?: string) {
  const v = normalizeCopyText(value);
  if (!v) return;
  void navigator.clipboard.writeText(v);
  recordCopy(v, { kind, display });
}

export function OrderIdentityChips({
  platformLabel,
  platformIconClass,
  platformBorderClass,
  productPageUrl,
  marketplaceOrderUrl = null,
  isFba,
  orderId,
  hideOrderId,
  tracking,
  trackingAction,
  onPasteTracking,
  serialChip,
  isMobile,
}: OrderIdentityChipsProps) {
  const history = useClipboardHistory();
  const lastTracking = history.find((e) => e.kind === 'tracking' && e.value.trim());
  const trackingUrl = tracking ? getTrackingUrl(tracking) : null;

  const platformItems: CopyChipHoverMenuItem[] = [];
  if (productPageUrl) {
    platformItems.push({
      id: 'copy-listing',
      label: 'Copy listing link',
      icon: <Copy />,
      onSelect: () => copyValue(productPageUrl, 'listing', platformLabel),
    });
    platformItems.push({
      id: 'open-listing',
      label: 'Open listing',
      icon: <ExternalLink />,
      tone: 'accent',
      onSelect: () => openExternal(productPageUrl),
    });
  }

  const orderItems: CopyChipHoverMenuItem[] = [
    {
      id: 'copy-order',
      label: 'Copy order number',
      icon: <Copy />,
      onSelect: () => copyValue(orderId, 'id', getLast4(orderId)),
    },
  ];
  if (marketplaceOrderUrl) {
    orderItems.push({
      id: 'open-order',
      label: platformLabel ? `Open on ${platformLabel}` : 'Open on platform',
      icon: <ExternalLink />,
      tone: 'accent',
      onSelect: () => openExternal(marketplaceOrderUrl),
    });
  }

  const trackingItems: CopyChipHoverMenuItem[] = tracking
    ? [
        {
          id: 'copy-trk',
          label: 'Copy tracking',
          icon: <Copy />,
          onSelect: () => copyValue(tracking, 'tracking', getLast4(tracking)),
        },
        ...(trackingUrl
          ? [
              {
                id: 'open-trk',
                label: 'Open tracking page',
                icon: <ExternalLink />,
                tone: 'accent' as const,
                onSelect: () => openExternal(trackingUrl),
              },
            ]
          : []),
      ]
    : [];

  const emptyTrackingNode = (() => {
    if (tracking) return null;
    if (lastTracking && onPasteTracking) {
      const last4 = getLast4(lastTracking.value);
      return (
        <CopyChipHoverMenu
          menuLabel="Tracking actions"
          items={[
            {
              id: 'paste-trk',
              label: `Paste ${last4} from clipboard`,
              icon: <Clipboard />,
              tone: 'accent',
              onSelect: () => onPasteTracking(lastTracking.value),
            },
          ]}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPasteTracking(lastTracking.value);
            }}
            className="ds-raw-button inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-50"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {last4}
          </button>
        </CopyChipHoverMenu>
      );
    }
    return trackingAction ?? null;
  })();

  const columns: ChipColumn[] = [
    {
      key: 'platform',
      width: CHIP_COL.platform,
      node: !isFba ? (
        <CopyChipHoverMenu menuLabel={`${platformLabel || 'Platform'} actions`} items={platformItems}>
          <PlatformChip
            label={platformLabel}
            underlineClass={platformBorderClass}
            iconClass={platformIconClass}
            tooltipValue={productPageUrl ? 'Copy listing link' : 'No listing link'}
            onClick={() => {
              if (productPageUrl) copyValue(productPageUrl, 'listing', platformLabel);
            }}
          />
        </CopyChipHoverMenu>
      ) : null,
    },
    {
      key: 'orderid',
      width: CHIP_COL.id,
      node: hideOrderId ? (
        <OrderIdChipPlaceholder />
      ) : (
        <CopyChipHoverMenu menuLabel="Order number actions" items={orderItems}>
          <OrderIdChip value={orderId} display={getLast4(orderId)} />
        </CopyChipHoverMenu>
      ),
    },
    {
      key: 'tracking',
      width: CHIP_COL.tracking,
      node: tracking ? (
        <CopyChipHoverMenu menuLabel="Tracking actions" items={trackingItems}>
          <TrackingOrSkuScanChip value={tracking} />
        </CopyChipHoverMenu>
      ) : (
        emptyTrackingNode
      ),
    },
  ];

  if (serialChip !== undefined) {
    columns.push({ key: 'serial', width: CHIP_COL.serial, node: serialChip });
  }

  return isMobile ? (
    <div className={dashboardOrderRowChipsClass(true)}>
      {columns.map((c) => c.node && <span key={c.key} className="contents">{c.node}</span>)}
    </div>
  ) : (
    <ChipColumns columns={columns} />
  );
}
