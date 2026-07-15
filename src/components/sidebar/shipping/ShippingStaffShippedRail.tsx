'use client';

/**
 * Shipping-mode sidebar rail — last 50 personal dock ship-outs
 * (`/api/orders/recent?staff=` → SHIP_CONFIRM by the signed-in staffer).
 * Dense Testing-parity row anatomy (title + qty·condition). Selecting a row
 * opens Shipping preview so serials can be edited without leaving Shipping.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import type { SidebarRailRowContext } from '@/components/sidebar/SidebarRailShell';
import { dispatchUpNextPreview, type UpNextPreviewPayload } from '@/utils/events';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import { filterShippingRailOrders } from '@/components/sidebar/tech/filter-shipping-rail-orders';
import {
  getShippedOutStatusDot,
  getShippedOutStatusDotLabel,
  shippedOutToDenseRailVM,
} from './shipped-out-rail-vm';
import {
  recentOrderToShippedRow,
  SHIPPING_RAIL_REFRESH_EVENTS,
  type RecentOrderRow,
  type ShippedHistoryRow,
} from './shipping-rail-shared';

interface Props {
  /** Signed-in staff id — rail is scoped to this staffer's ship-outs. */
  techId: string;
  /** Client-side filter over the loaded ship-outs. */
  filterText?: string;
}

const RAIL_LIMIT = 50;

const getRowId = (row: ShippedHistoryRow) => row.id;
const getRowActivityAt = (row: ShippedHistoryRow) => row.ship_confirmed_at ?? row.created_at;

function useShippedRailSelection(): number | null {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  useEffect(() => {
    const handlePreview = (e: Event) => {
      const detail = (e as CustomEvent<UpNextPreviewPayload>).detail;
      setSelectedOrderId(detail && detail.kind === 'order' ? detail.order.id : null);
    };
    const handleActive = (e: Event) => {
      const detail = (e as CustomEvent<{ activeOrder: ActiveStationOrder } | null>).detail;
      if (detail) setSelectedOrderId(null);
    };
    const handleCloseDetails = () => setSelectedOrderId(null);
    window.addEventListener('tech-upnext-preview', handlePreview);
    window.addEventListener('tech-active-order-changed', handleActive);
    window.addEventListener('close-shipped-details', handleCloseDetails);
    return () => {
      window.removeEventListener('tech-upnext-preview', handlePreview);
      window.removeEventListener('tech-active-order-changed', handleActive);
      window.removeEventListener('close-shipped-details', handleCloseDetails);
    };
  }, []);
  return selectedOrderId;
}

/** Testing-parity content stack — no eyebrow / chevron band. */
function ShippedOutRowMain({
  row,
}: {
  row: ShippedHistoryRow;
  ctx: SidebarRailRowContext;
}) {
  return <RailRowBody className="flex-1" vm={shippedOutToDenseRailVM(row)} />;
}

export function ShippingStaffShippedRail({ techId, filterText = '' }: Props) {
  const trimmedFilter = filterText.trim();
  const selectedOrderId = useShippedRailSelection();
  const parsedTechId = Number(techId);
  const staffId = Number.isFinite(parsedTechId) && parsedTechId > 0 ? parsedTechId : 0;

  const queryKey = useMemo(
    () => ['shipping-staff-shipped-out', staffId, trimmedFilter] as const,
    [staffId, trimmedFilter],
  );

  const fetchFn = useCallback(async (): Promise<ShippedHistoryRow[]> => {
    if (staffId <= 0) return [];
    // Session staff is bound server-side; count-capped to 50 newest ship-outs.
    const params = new URLSearchParams({ staff: String(staffId) });
    if (trimmedFilter) params.set('q', trimmedFilter);
    const res = await fetch(`/api/orders/recent?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json().catch(() => ({}));
    const flat: RecentOrderRow[] = Array.isArray(data?.orders)
      ? data.orders
      : (Array.isArray(data?.groups) ? data.groups : []).flatMap(
          (g: { orders?: RecentOrderRow[] }) => (Array.isArray(g.orders) ? g.orders : []),
        );
    const rows = flat.map(recentOrderToShippedRow).slice(0, RAIL_LIMIT);
    if (!trimmedFilter) return rows;
    return filterShippingRailOrders(rows, trimmedFilter) as ShippedHistoryRow[];
  }, [staffId, trimmedFilter]);

  return (
    <SidebarRecentRailBase<ShippedHistoryRow>
      queryKey={queryKey}
      fetchFn={fetchFn}
      refreshEvents={[...SHIPPING_RAIL_REFRESH_EVENTS]}
      selectedId={selectedOrderId}
      limit={RAIL_LIMIT}
      eyebrowTitle="Recently Shipped"
      eyebrowSuffix="You"
      emptyText={staffId <= 0 ? 'Sign in to see your ship-outs' : 'No recent ship-outs'}
      getId={getRowId}
      getActivityAt={getRowActivityAt}
      onSelect={(row) => {
        dispatchUpNextPreview(
          selectedOrderId === row.id ? null : { kind: 'order', order: row },
        );
      }}
      getStatusDot={getShippedOutStatusDot}
      getStatusDotLabel={getShippedOutStatusDotLabel}
      renderRowMain={(row, ctx) => <ShippedOutRowMain row={row} ctx={ctx} />}
    />
  );
}
