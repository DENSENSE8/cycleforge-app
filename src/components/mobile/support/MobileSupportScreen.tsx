'use client';

/**
 * `/m/support` — phone Support (route node `support-items-mobile`): the list,
 * or with `?item=<support item id>` that item's record. One route, like the
 * desk's `/support?item=`, so a link copied from either surface lands on the
 * same record.
 */

import { useSearchParams } from 'next/navigation';
import { MobileSupportList } from './MobileSupportList';
import { MobileSupportRecord } from './MobileSupportRecord';

export function MobileSupportScreen() {
  const raw = Number(useSearchParams()?.get('item') ?? '');
  return Number.isInteger(raw) && raw > 0 ? <MobileSupportRecord key={raw} supportItemId={raw} /> : <MobileSupportList />;
}
