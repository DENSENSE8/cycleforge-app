'use client';

/**
 * Incoming details stack header — house PaneHeader chrome (icon badge + label
 * + status pill + action bar with Sync + prev/next + tabs). Close lives on
 * RightRailHost backdrop / Esc (same as Shipped slide-over).
 */

import { Inbox, RefreshCw } from '@/components/Icons';
import {
  PaneHeader,
  PaneHeaderActionBar,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderStatusPill,
  PaneHeaderTabs,
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import type { DetailsResponse, TabId } from './incoming-details-shared';

function statusTone(
  status: string | null | undefined,
): 'neutral' | 'blue' | 'emerald' | 'amber' | 'rose' {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (s.includes('deliver')) return 'emerald';
  if (s.includes('transit') || s.includes('ship')) return 'blue';
  if (s.includes('cancel') || s.includes('fail') || s.includes('exception')) return 'rose';
  if (s.includes('pending') || s.includes('open') || s.includes('issued')) return 'amber';
  return 'neutral';
}

export function IncomingDetailsHeader({
  headerPo,
  headerTracking,
  headerOrder,
  vendorName,
  statusLabel,
  isShipmentOnly,
  isInboundOnly,
  syncing,
  onSync,
  tabs,
  tab,
  onTabChange,
}: {
  headerPo: string;
  headerTracking: string;
  headerOrder: string;
  vendorName: string | null;
  statusLabel: string | null;
  isShipmentOnly: boolean;
  isInboundOnly: boolean;
  syncing: boolean;
  onSync: () => void;
  tabs: Array<{ value: TabId; label: string }>;
  tab: TabId;
  onTabChange: (next: TabId) => void;
}) {
  const eyebrow = isInboundOnly
    ? 'Marketplace order'
    : isShipmentOnly
      ? 'Shipment'
      : 'Purchase order';

  const value =
    headerPo ||
    headerOrder ||
    (headerTracking ? headerTracking : '—');

  const actions: PaneHeaderActionBarAction[] = isShipmentOnly
    ? []
    : [
        {
          key: 'sync',
          label: syncing ? 'Syncing' : isInboundOnly ? 'Resync' : 'Sync',
          icon: <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />,
          onClick: onSync,
          disabled: syncing,
          toneClassName: 'text-emerald-700',
          title: isInboundOnly
            ? 'Re-pull this order from linked marketplace accounts (eBay) + re-poll its shipment'
            : 'Re-pull this PO from inventory + re-poll its shipment',
          ariaLabel: isInboundOnly ? 'Resync this marketplace order' : 'Sync this PO',
        },
      ];

  const navigate = (direction: 'prev' | 'next') => {
    window.dispatchEvent(new CustomEvent('receiving-navigate-table', { detail: direction }));
  };

  return (
    <PaneHeader
      className="shrink-0 border-border-hairline bg-surface-card/90 backdrop-blur-xl"
      rowClassName="px-6"
      leftSlot={
        <>
          <PaneHeaderIconBadge Icon={Inbox} bg="bg-emerald-100" tint="text-emerald-700" />
          <PaneHeaderLabel
            eyebrow={eyebrow}
            value={value}
            valueTitle={value}
          />
        </>
      }
      belowSlot={
        <>
          {(statusLabel || vendorName) ? (
            <div className="flex flex-wrap items-center gap-2 px-6 pb-2">
              {statusLabel ? (
                <PaneHeaderStatusPill tone={statusTone(statusLabel)} pulse={false}>
                  {statusLabel}
                </PaneHeaderStatusPill>
              ) : null}
              {vendorName ? (
                <span className="truncate text-role-caption font-semibold text-text-soft">
                  {vendorName}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="px-6 py-2">
            <PaneHeaderActionBar
              iconOnly={actions.length > 0}
              variant="card"
              actions={actions}
              onPrev={() => navigate('prev')}
              onNext={() => navigate('next')}
              prevTitle="Previous row"
              nextTitle="Next row"
            />
          </div>
          <PaneHeaderTabs
            dense
            tabs={tabs}
            value={tab}
            onChange={onTabChange}
            className="px-6"
          />
        </>
      }
    />
  );
}

/** Derive status + vendor strings once data lands. */
export function incomingDetailsHeaderMeta(data: DetailsResponse | undefined): {
  statusLabel: string | null;
  vendorName: string | null;
} {
  if (!data) return { statusLabel: null, vendorName: null };
  const statusLabel =
    data.po?.status?.trim() ||
    data.shipment?.latest_status_category?.trim() ||
    null;
  const vendorName =
    data.po?.vendor_name?.trim() ||
    data.inbound?.seller_name?.trim() ||
    null;
  return { statusLabel, vendorName };
}

/** Stable RightRailHost occupant id for Incoming row identity. */
export function incomingDetailsRailId(props: {
  zohoPurchaseOrderId?: string | null;
  shipmentId?: number | null;
  inboundSourceType?: string | null;
  inboundSourceOrderId?: string | null;
}): string {
  if (props.zohoPurchaseOrderId) return `detail:incoming:${props.zohoPurchaseOrderId}`;
  if (props.shipmentId != null) return `detail:incoming:shipment:${props.shipmentId}`;
  if (props.inboundSourceType && props.inboundSourceOrderId) {
    return `detail:incoming:inbound:${props.inboundSourceType}:${props.inboundSourceOrderId}`;
  }
  return 'detail:incoming:unknown';
}
