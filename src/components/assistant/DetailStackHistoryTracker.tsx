'use client';

/** DetailStackHistoryTracker — watches the URL for any known detail-stack open param (openShipmentId, openReceivingId, openOrderId, …) and… */

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { recordDetailStack } from '@/lib/detail-stacks/history-store';
import {
  DETAIL_STACK_DEFS,
  DETAIL_STACK_PARAMS,
} from '@/lib/detail-stacks/registry';

function shorten(id: string): string {
  return id.length > 10 ? `…${id.slice(-6)}` : `#${id}`;
}

export function DetailStackHistoryTracker(): null {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    for (const { kind, param } of DETAIL_STACK_PARAMS) {
      const id = params.get(param);
      if (!id) continue;
      const def = DETAIL_STACK_DEFS[kind];
      recordDetailStack({
        kind,
        id,
        label: `${def.noun} ${shorten(id)}`,
        path: pathname,
        search: params.toString(),
      });
    }
  }, [pathname, params]);

  return null;
}
