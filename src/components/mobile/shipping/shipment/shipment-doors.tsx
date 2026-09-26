import { Activity, Boxes, Package } from '@/components/Icons';
import { detailDoor, type DetailDoor } from '@/lib/mobile/detail-door';
import { plural } from '@/lib/orders/order-hub';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';

/**
 * The package's doors (Items · Activity · Other boxes). `link` carries `?back=`
 * onto each href (`useShipmentHub().link`).
 */
export function shipmentDoors(record: ShipmentRecord, base: string, link: (href: string) => string): DetailDoor[] {
  const doors = [
    detailDoor(base, 'items', 'Items', <Package />, {
      meta: record.items.length > 0 ? plural(record.items.length, 'order line') : 'No order lines on this package',
      enabled: record.items.length > 0,
    }),
    detailDoor(base, 'activity', 'Activity', <Activity />, {
      meta: record.actions.length > 0 ? plural(record.actions.length, 'action') : 'Nothing recorded yet',
    }),
    detailDoor(base, 'boxes', 'Other boxes', <Boxes />, {
      meta:
        record.siblings.length > 0
          ? `${record.siblings.length} other box${record.siblings.length === 1 ? '' : 'es'}${record.box ? ` · this is box ${record.box.seq ?? '?'} of ${record.box.total}` : ''}`
          : 'The only box on its order',
      enabled: record.siblings.length > 0,
    }),
  ];
  return doors.map((door) => (door.href ? { ...door, href: link(door.href) } : door));
}
