'use client';

import { useCallback, useRef } from 'react';
import { Clipboard, Copy, ExternalLink, RefreshCw } from '@/components/Icons';
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
 *   • Platform — primary **open listing** (new tab); hover: Copy listing link
 *   • Order id — primary **copy**; hover: Open on platform
 *   • Tracking filled — primary **copy**; hover: Open tracking page · Replace tracking
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
  /** Optional callback to replace an EXISTING tracking number (from the chip
   *  menu → "Replace tracking", reads the OS clipboard). */
  onReplaceTracking?: (tracking: string) => void;
  /** Optional 4th column — serial chip on station (Tech) rows. */
  serialChip?: React.ReactNode;
  isMobile: boolean;
  /**
   * `icons` (default) — full CopyChip family with leading tone glyphs (Labels,
   * Receiving, Station, and the mobile fallback all keep these).
   * `plain` — quiet, icon-less chips for the Sheets-like queue grid: the sticky
   * column header already labels Platform / Order / Tracking, so the leading
   * glyphs are noise there. Copy + hover menus stay intact. Never strips icons
   * globally — scoped to this prop.
   */
  variant?: 'icons' | 'plain';
  /**
   * `cluster` (default) — one right-aligned {@link ChipColumns} flex blob.
   * `cells` — return the platform / order / tracking chips as three SEPARATE
   * fixed-width grid cells (React fragment) so the parent grid can lock each
   * column to its own header. Staged serial folds into the tracking cell.
   */
  layout?: 'cluster' | 'cells';
  /** Fires when any chip's hover menu opens/closes — lets the row keep its
   *  hover-expanded chrome (chevron + shifted chips) while a menu is up. */
  onMenuOpenChange?: (open: boolean) => void;
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
  onReplaceTracking,
  serialChip,
  isMobile,
  variant = 'icons',
  layout = 'cluster',
  onMenuOpenChange,
}: OrderIdentityChipsProps) {
  const plain = variant === 'plain';
  const history = useClipboardHistory();
  const lastTracking = history.find((e) => e.kind === 'tracking' && e.value.trim());
  const trackingUrl = tracking ? getTrackingUrl(tracking) : null;

  // Aggregate open/close across the chip menus (only one is realistically open at
  // a time, but hover hand-off briefly overlaps) → bubble a single boolean up.
  const openCount = useRef(0);
  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      openCount.current = Math.max(0, openCount.current + (open ? 1 : -1));
      onMenuOpenChange?.(openCount.current > 0);
    },
    [onMenuOpenChange],
  );

  // Clicking the platform chip opens the listing in a new tab (primary); the menu
  // carries the secondary "copy listing link".
  const platformItems: CopyChipHoverMenuItem[] = [];
  if (productPageUrl) {
    platformItems.push({
      id: 'copy-listing',
      label: 'Copy listing link',
      icon: <Copy />,
      onSelect: () => copyValue(productPageUrl, 'listing', platformLabel),
    });
  }

  // Clicking the chip already copies the order number (OrderIdChip → handleCopy),
  // so the menu carries only the secondary "open on platform" action. When there
  // is no marketplace URL the menu is empty → CopyChipHoverMenu disables itself
  // and the chip is a plain copy-on-click.
  const orderItems: CopyChipHoverMenuItem[] = [];
  if (marketplaceOrderUrl) {
    orderItems.push({
      id: 'open-order',
      label: platformLabel ? `Open on ${platformLabel}` : 'Open on platform',
      icon: <ExternalLink />,
      tone: 'accent',
      onSelect: () => openExternal(marketplaceOrderUrl),
    });
  }

  // Clicking the tracking chip already copies (TrackingOrSkuScanChip → handleCopy),
  // so the menu carries the secondary "Open tracking page" + "Replace tracking"
  // (paste a new number from the OS clipboard, overwriting the existing one).
  const trackingItems: CopyChipHoverMenuItem[] = [];
  if (tracking && trackingUrl) {
    trackingItems.push({
      id: 'open-trk',
      label: 'Open tracking page',
      icon: <ExternalLink />,
      tone: 'accent',
      onSelect: () => openExternal(trackingUrl),
    });
  }
  if (tracking && onReplaceTracking) {
    trackingItems.push({
      id: 'replace-trk',
      label: 'Replace tracking',
      icon: <RefreshCw />,
      onSelect: async () => {
        try {
          const text = await navigator.clipboard.readText();
          const next = String(text || '').trim();
          if (next) onReplaceTracking(next);
        } catch {}
      },
    });
  }

  const emptyTrackingNode = (() => {
    if (tracking) return null;
    if (lastTracking && onPasteTracking) {
      const last4 = getLast4(lastTracking.value);
      return (
        <CopyChipHoverMenu
          menuLabel="Tracking actions"
          onOpenChange={handleMenuOpenChange}
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
            className="ds-raw-button inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-role-caption font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-50"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {last4}
          </button>
        </CopyChipHoverMenu>
      );
    }
    return trackingAction ?? null;
  })();

  const platformChipNode = !isFba ? (
    <CopyChipHoverMenu menuLabel={`${platformLabel || 'Platform'} actions`} items={platformItems} onOpenChange={handleMenuOpenChange}>
      <PlatformChip
        label={platformLabel}
        underlineClass={platformBorderClass}
        iconClass={platformIconClass}
        showIcon={!plain}
        tooltipValue={productPageUrl ? 'Open listing' : 'No listing link'}
        onClick={() => {
          if (productPageUrl) openExternal(productPageUrl);
        }}
      />
    </CopyChipHoverMenu>
  ) : null;

  const orderChipNode = hideOrderId ? (
    <OrderIdChipPlaceholder plain={plain} />
  ) : (
    <CopyChipHoverMenu menuLabel="Order number actions" items={orderItems} onOpenChange={handleMenuOpenChange}>
      <OrderIdChip value={orderId} display={getLast4(orderId)} plain={plain} />
    </CopyChipHoverMenu>
  );

  const trackingChipNode = tracking ? (
    <CopyChipHoverMenu menuLabel="Tracking actions" items={trackingItems} onOpenChange={handleMenuOpenChange}>
      <TrackingOrSkuScanChip value={tracking} plain={plain} />
    </CopyChipHoverMenu>
  ) : (
    // Empty tracking: the paste / Add-TRK affordance (labels) wins; otherwise a
    // staged row folds its serial into this trailing identity cell.
    emptyTrackingNode ?? serialChip ?? null
  );

  // Sheets-like grid: three fixed-width cells the parent grid locks to its
  // Platform / Order / Tracking headers. Left-aligned so values sit under labels.
  if (layout === 'cells') {
    return (
      <>
        <div data-col="platform" className="flex min-w-0 items-center">{platformChipNode}</div>
        <div data-col="order" className="flex min-w-0 items-center">{orderChipNode}</div>
        <div data-col="tracking" className="flex min-w-0 items-center">{trackingChipNode}</div>
      </>
    );
  }

  const columns: ChipColumn[] = [
    { key: 'platform', width: CHIP_COL.platform, node: platformChipNode },
    { key: 'orderid', width: CHIP_COL.id, node: orderChipNode },
    {
      key: 'tracking',
      width: CHIP_COL.tracking,
      node: tracking ? trackingChipNode : emptyTrackingNode,
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
