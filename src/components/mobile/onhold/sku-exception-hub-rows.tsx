'use client';

import type { DetailNavItem } from '@/components/mobile/detail/DetailParts';
import { Images, Link2, MapPin } from '@/components/Icons';
import { mobileSkuExceptionHref, skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import { detailDoor } from '@/lib/mobile/detail-door';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/**
 * The SKU exception hub's doors, one per exact job: Photos (what it looks
 * like), Locations (where it is and how many), Pair (what it really is). A new
 * screen plugs in here; the hub layout never changes.
 */
export function skuExceptionHubRows(item: ProvisionalSku): DetailNavItem[] {
  const base = mobileSkuExceptionHref(item.sku);
  const faces = item.locations.map((loc) => skuExceptionLocationFace(loc.barcode));
  return [
    detailDoor(base, 'photos', 'Photos', <Images />, {
      meta: item.photoCount > 0 ? plural(item.photoCount, 'photo') : 'No photos yet — add one so staff can recognise it',
    }),
    detailDoor(base, 'locations', 'Locations', <MapPin />, {
      meta:
        faces.length > 0
          ? `${item.stock} on hand · ${faces.slice(0, 2).join(', ')}${faces.length > 2 ? ` +${faces.length - 2}` : ''}`
          : 'Not in a location yet — count it into one',
    }),
    detailDoor(base, 'pair', 'Pair to Zoho SKU', <Link2 />, {
      meta: 'Find the real product and move this stock onto it',
    }),
  ];
}
