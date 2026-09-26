'use client';

import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { carrierBrandDotPaint, resolveCarrierBrand } from '@/lib/carrier-brand';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { useCallback, useRef } from 'react';
import { Clipboard, Copy, Pencil } from '@/components/Icons';
import {
  OrderIdChipPlaceholder,
  PlatformChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { ChipColumns, CHIP_COL, type ChipColumn } from '@/components/ui/ChipColumns';
import { CopyChipHoverMenu, type CopyChipHoverMenuItem } from '@/components/ui/CopyChipHoverMenu';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { resolveMarketplaceChipIdentity } from '@/lib/marketplace-order-id';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { dashboardOrderRowChipsClass } from '@/lib/dashboard-order-row-layout';
import { cn } from '@/utils/_cn';
import { useClipboardHistory, recordCopy } from '@/lib/clipboard-history';
import { normalizeCopyText } from '@/lib/copy-chip-format';

/** The platform · order-id · tracking chip cluster shared by the dashboard order-row tables (unshipped queue, shipped, packer, tech). */
interface OrderIdentityChipsProps {
  platformLabel: string;
  /**
   * Icon color for the platform chip (gray when not linkable). Optional when
   * {@link showPlatform} is false — surfaces that omit platform never color-map.
   */
  platformIconClass?: string;
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
  /**
   * Authoritative shipment / order carrier when the host has it. Prefer for Open
   * over regex detect ({@link TrackingNumberMenuChip} `carrierHint`).
   */
  carrierHint?: string | null;
  /** Action node for the empty tracking slot when no clipboard tracking (e.g. Add TRK#). */
  trackingAction?: React.ReactNode;
  /** Optional callback when operator pastes clipboard tracking into empty slot. */
  onPasteTracking?: (tracking: string) => void;
  /** Optional callback from the filled-tracking menu → "Edit". Host opens the
   *  order inspector replace flow — never clipboard-steals. */
  onEditTracking?: () => void;
  /** Opens the host row's listing-link (`item_number`) editor — surfaces the
   *  "Edit listing link" hover action on the platform cell (Pending grid). */
  onEditListingLink?: () => void;
  /**
   * When false, omit PlatformChip / PlatformMark from cluster and cells layouts
   * (To-ship orders queue — order + tracking only; platform lives on the chip
   * tooltip via `platformLabel`). Default true for other surfaces.
   */
  showPlatform?: boolean;
  /** Optional 4th column — serial chip on station (Tech) rows. */
  serialChip?: React.ReactNode;
  isMobile: boolean;
  /** `icons` (default) — full CopyChip family with leading tone glyphs (Labels, Receiving, Station, and the mobile fallback all keep these). */
  variant?: 'icons' | 'plain';
  /** `cluster` (default) — one right-aligned {@link ChipColumns} flex blob. */
  layout?: 'cluster' | 'cells';
  /** When `layout="cells"`, per-column grid chrome (vertical rule + horizontal inset) merged into each of the three cells so platform / order… */
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

/** Build the platform / order / tracking chip nodes once per row. */
function useOrderIdentityCellNodes({
  platformLabel,
  platformIconClass,
  productPageUrl,
  marketplaceOrderUrl = null,
  isFba,
  orderId,
  hideOrderId,
  tracking,
  carrierHint = null,
  trackingAction,
  onPasteTracking,
  onEditTracking,
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
        iconClass={platformIconClass ?? ''}
        showIcon={!plain}
        tooltipValue={productPageUrl ? 'Open listing' : 'No listing link'}
        onClick={() => {
          if (productPageUrl) openExternal(productPageUrl);
        }}
      />
    </CopyChipHoverMenu>
  ) : null;

  /** IDENTITY LANGUAGE (ruled 2026-08-20): */
  const orderChipNode = hideOrderId ? (
    <OrderIdChipPlaceholder plain={plain} />
  ) : plain ? (
    <OrderNumberIdentity
      orderId={orderId}
      platformLabel={platformLabel}
      openHref={marketplaceOrderUrl}
      onMenuOpenChange={handleMenuOpenChange}
    />
  ) : (
    <OrderNumberMenuChip
      value={orderId}
      platformLabel={resolveMarketplaceChipIdentity(orderId, platformLabel).platformLabel}
      openHref={marketplaceOrderUrl}
      onMenuOpenChange={handleMenuOpenChange}
      dense
    />
  );

  const trackingChipNode = tracking ? (
    <TrackingIdentity
      tracking={tracking}
      carrierHint={carrierHint}
      onEdit={onEditTracking}
      onMenuOpenChange={handleMenuOpenChange}
    />
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

/** Order # identity — the one face every record surface paints: */
export function OrderNumberIdentity({
  orderId,
  platformLabel,
  openHref = null,
  onMenuOpenChange,
}: {
  orderId: string;
  platformLabel?: string | null;
  openHref?: string | null;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const identity = resolveMarketplaceChipIdentity(orderId, platformLabel);
  const dot = platformMetaBrandDot(identity.meta);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" data-identity="order">
      <BrandIdentityDot className={dot.className} style={dot.style} />
      <OrderNumberMenuChip
        value={orderId}
        platformLabel={identity.platformLabel}
        openHref={openHref}
        onMenuOpenChange={onMenuOpenChange}
        plain
        dense
      />
    </span>
  );
}

/**
 * Tracking # identity — the carrier brand RING (known carrier hex, else house
 * tracking blue) + the last-8 copy chip (hover: open on the carrier, edit).
 */
export function TrackingIdentity({
  tracking,
  carrierHint = null,
  onEdit,
  onMenuOpenChange,
}: {
  tracking: string;
  carrierHint?: string | null;
  onEdit?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const dot = carrierBrandDotPaint(resolveCarrierBrand(tracking, carrierHint));
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" data-identity="tracking">
      <BrandIdentityDot className={dot.className} style={dot.style} variant="ring" />
      <TrackingNumberMenuChip
        value={tracking}
        carrierHint={carrierHint}
        plain
        onEdit={onEdit}
        onMenuOpenChange={onMenuOpenChange}
      />
    </span>
  );
}

export function OrderIdentityChips(props: OrderIdentityChipsProps) {
  const {
    tracking,
    serialChip,
    isMobile,
    layout = 'cluster',
    gridCellClass,
    showPlatform = true,
  } = props;
  // Grid `cells` layout honors the per-staff column config so the per-column header "Hide field" actually drops platform/order/tracking…
  const isColumnHidden = (_key?: string) => false;
  const nodes = useOrderIdentityCellNodes(props);

  // Sheets-like grid: three fixed-width cells the parent grid locks to its
  // Platform / Order / Tracking headers. Left-aligned so values sit under labels.
  if (layout === 'cells') {
    return (
      <>
        {showPlatform ? (
          <div data-col="platform" className={cn('flex min-w-0 items-center', gridCellClass?.('platform'))}>
            {isColumnHidden('platform') ? null : nodes.platformMark}
          </div>
        ) : null}
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
    ...(showPlatform
      ? [{ key: 'platform' as const, width: CHIP_COL.platform, node: nodes.platformChip }]
      : []),
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
