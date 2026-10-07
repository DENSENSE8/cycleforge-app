'use client';

/**
 * The open docs sheet stays current when another station links, unlinks,
 * buys or prints (operator 2026-10-06): an order change (`order.changed`,
 * `order.picked` on the orders channel), a shipment / tracking change
 * (`shipment.changed`) or a station scan-out (`activity.logged`, station
 * channel) re-reads the sheet's packets and the label ledger — the same
 * channels the Live feed board and the Orders dashboards listen to. A burst
 * collapses to one re-read per frame. Only while the sheet is open.
 */

import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOrdersChannelName, getStationChannelName } from '@/lib/realtime/channels';
import { usePacketRefresh } from '@/features/labels-docs/orders/pane/use-packet-refresh';

export function useSheetRealtime(open: boolean): void {
  const refresh = usePacketRefresh();
  const orgId = useAuth().user?.organizationId;
  const orders = orgId ? getOrdersChannelName(orgId) : '';
  const station = orgId ? getStationChannelName(orgId) : '';
  const reread = () => void refresh();
  const frame = { coalesce: 'frame' as const };
  useAblyChannel(orders, 'order.changed', reread, open && Boolean(orders), frame);
  useAblyChannel(orders, 'order.picked', reread, open && Boolean(orders), frame);
  useAblyChannel(station, 'shipment.changed', reread, open && Boolean(station), frame);
  useAblyChannel(station, 'activity.logged', reread, open && Boolean(station), frame);
}
