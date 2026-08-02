'use client';

import { useCallback, useRef } from 'react';
import { Clipboard, Copy, ExternalLink, Pencil, RefreshCw } from '@/components/Icons';
import {
  OrderIdChip,
  OrderIdChipPlaceholder,
  TrackingOrSkuScanChip,
  PlatformChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { ChipColumns, CHIP_COL, type ChipColumn } from '@/components/ui/ChipColumns';
import { CopyChipHoverMenu, type CopyChipHoverMenuItem } from '@/components/ui/CopyChipHoverMenu';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { dashboardOrderRowChipsClass } from '@/lib/dashboard-order-row-layout';
import { cn } from '@/utils/_cn';
import { useClipboardHistory, recordCopy } from '@/lib/clipboard-history';
import { getTrackingUrl } from '@/utils/order-links';
import { normalizeCopyText } from '@/lib/copy-chip-format';

/**
 * The platform · order-id · tracking chip cluster shared by the dashboard
 * order-row tables (unshipped queue, shipped, packer, tech).
 *
 * Hover menus (unbox IdentityLinkChip pattern via {@link CopyChipHoverMenu}):
 *   • Platform — primary **open listing** (new tab); hover: Copy listing link
 *     (+ Edit listing link when the host row supplies an editor)
 *   • Order id — primary **copy**; hover: Open on platform
 *   • Tracking filled — primary **copy**; hover: Open tracking page · Replace tracking
 *   • Tracking empty — paste last in-app tracking clipboard entry when present
 *
 * Grid surfaces (`layout="cells"` / {@link useOrderIdentityCellNodes}) render
 * the platform as a FIXED-footprint brand mark ({@link PlatformMark} — bare
 * monochrome channel icon / lettermark), never a variable-width
 * marketplace name; the label lives in tooltip + sr-only.
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
  /** FBA orders carry no listing chip; grid cells show the FBA mark instead. */
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
  /** Opens the host row's listing-link (`item_number`) editor — surfaces the
   *  "Edit listing link" hover action on the platform cell (Pending grid). */
  onEditListingLink?: () => void;
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
   * grid cells (React fragment) so the parent grid can lock each column to its
   * own header. Staged serial folds into the tracking cell. Column-reorderable
   * grids place single cells via {@link useOrderIdentityCellNodes} instead.
   */
  layout?: 'cluster' | 'cells';
  /**
   * When `layout="cells"`, per-column grid chrome (vertical rule + horizontal
   * inset) merged into each of the three cells so platform / order / tracking
   * match the parent grid's other columns. The Sheets-grid parent passes
   * `ordersQueueGridCell`; `tracking` is the grid's last column (no trailing
   * rule). Omitted by non-grid consumers — the cells keep their bare layout.
   */
  gridCellClass?: (col: 'platform' | 'order' | 'tracking') => string;
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

/**
 * Build the platform / order / tracking chip nodes once per row. The default
 * layouts consume all three; a column-reorderable grid places each node in its
 * own registry-rendered cell (any column order — the three cells no longer
 * need to be adjacent siblings).
 */
export function useOrderIdentityCellNodes({
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
  onEditListingLink,
  serialChip,
  variant = 'icons',
  onMenuOpenChange,
}: Omit<OrderIdentityChipsProps, 'isMobile' | 'layout' | 'gridCellClass'>): {
  /** Fixed-footprint brand mark (grid cells) — sr-only + tooltip carry the label. */
  platformMark: React.ReactNode;
  /** Text platform chip (cluster / mobile layouts). */
  platformChip: React.ReactNode;
  order: React.ReactNode;
  tracking: React.ReactNode;
  emptyTracking: React.ReactNode;
} {
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
  // carries the secondary "copy listing link" + the row-supplied link editor.
  const platformItems: CopyChipHoverMenuItem[] = [];
  if (productPageUrl) {
    platformItems.push({
      id: 'copy-listing',
      label: 'Copy listing link',
      icon: <Copy />,
      onSelect: () => copyValue(productPageUrl, 'listing', platformLabel),
    });
  }
  if (onEditListingLink) {
    platformItems.push({
      id: 'edit-listing',
      label: 'Edit listing link',
      icon: <Pencil />,
      onSelect: onEditListingLink,
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
      const last4 = getLast8(lastTracking.value);
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
            className="ds-raw-button inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-role-caption font-semibold uppercase tracking-widest text-blue-700 hover:bg-blue-50"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {last4}
          </button>
        </CopyChipHoverMenu>
      );
    }
    return trackingAction ?? null;
  })();

  // Fixed-footprint brand mark for grid cells. FBA rows show the FBA mark
  // (identity without a listing target); unknown platforms show the quiet
  // empty mark. Tooltip + sr-only carry the label — never icon-only unnamed.
  const platformMeta = sourcePlatformMetaFromLabel(isFba ? 'fba' : platformLabel);
  const markLabel = isFba ? 'FBA' : platformLabel || 'No platform';
  const markTooltip = productPageUrl && !isFba ? `${markLabel} — open listing` : markLabel;
  const markNode = (
    <HoverTooltip label={markTooltip} focusable={false}>
      <button
        type="button"
        aria-label={markTooltip}
        disabled={!productPageUrl || isFba}
        onClick={(e) => {
          e.stopPropagation();
          if (productPageUrl && !isFba) openExternal(productPageUrl);
        }}
        className={cn(
          'ds-raw-button inline-flex items-center justify-center',
          productPageUrl && !isFba ? 'rounded-sm hover:bg-surface-hover' : 'cursor-default',
        )}
      >
        <PlatformMark
          platformValue={platformMeta.value}
          empty={!platformMeta.value}
          textClassName={platformIconClass || undefined}
        />
        <span className="sr-only">{markLabel}</span>
      </button>
    </HoverTooltip>
  );
  const platformMarkNode =
    platformItems.length > 0 ? (
      <CopyChipHoverMenu
        menuLabel={`${markLabel} actions`}
        items={platformItems}
        onOpenChange={handleMenuOpenChange}
      >
        {markNode}
      </CopyChipHoverMenu>
    ) : (
      markNode
    );

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
      <OrderIdChip value={orderId} display={getLast8(orderId)} plain={plain} fitDisplayWidth />
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

  return {
    platformMark: platformMarkNode,
    platformChip: platformChipNode,
    order: orderChipNode,
    tracking: trackingChipNode,
    emptyTracking: emptyTrackingNode,
  };
}

export function OrderIdentityChips(props: OrderIdentityChipsProps) {
  const {
    tracking,
    serialChip,
    isMobile,
    layout = 'cluster',
    gridCellClass,
  } = props;
  // Grid `cells` layout honors the per-staff column config so the per-column
  // header "Hide field" actually drops platform/order/tracking (their hide-keys
  // in the `orders` registry: platform / orderid / tracking). No-op outside a
  // provider, so the `cluster`/mobile consumers are unaffected.
  const isColumnHidden = useIsColumnHidden();
  const nodes = useOrderIdentityCellNodes(props);

  // Sheets-like grid: three fixed-width cells the parent grid locks to its
  // Platform / Order / Tracking headers. Left-aligned so values sit under labels.
  if (layout === 'cells') {
    return (
      <>
        <div data-col="platform" className={cn('flex min-w-0 items-center', gridCellClass?.('platform'))}>
          {isColumnHidden('platform') ? null : nodes.platformMark}
        </div>
        <div data-col="order" className={cn('flex min-w-0 items-center', gridCellClass?.('order'))}>
          {isColumnHidden('orderid') ? null : nodes.order}
        </div>
        <div data-col="tracking" className={cn('flex min-w-0 items-center', gridCellClass?.('tracking'))}>
          {isColumnHidden('tracking') ? null : nodes.tracking}
        </div>
      </>
    );
  }

  const columns: ChipColumn[] = [
    { key: 'platform', width: CHIP_COL.platform, node: nodes.platformChip },
    { key: 'orderid', width: CHIP_COL.id, node: nodes.order },
    {
      key: 'tracking',
      width: CHIP_COL.tracking,
      node: tracking ? nodes.tracking : nodes.emptyTracking,
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
