import { Activity, Hash } from '@/components/Icons';
import { detailDoor, type DetailDoor } from '@/lib/mobile/detail-door';
import { plural, type OrderHubData } from '@/lib/orders/order-hub';

/**
 * The order's doors (Units · Activity), shared by the order hub and the pack
 * job so both open the same screens. `link` carries `?by=id` / `?back=` onto
 * each href (`useOrderHub().link`).
 */
export function orderDoors(data: OrderHubData, base: string, link: (href: string) => string): DetailDoor[] {
  const serials = data.order.serials.length;
  const doors = [
    detailDoor(base, 'units', 'Units', <Hash />, {
      meta: serials > 0 ? plural(serials, 'serial') : 'No serials recorded on this order yet',
      enabled: serials > 0,
    }),
    detailDoor(base, 'activity', 'Activity', <Activity />, {
      meta: data.activity.length > 0 ? plural(data.activity.length, 'recent event') : 'Nothing recorded yet',
    }),
  ];
  return doors.map((door) => (door.href ? { ...door, href: link(door.href) } : door));
}
