'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { isDeskStageSurface } from '@/lib/sidebar-navigation';

/**
 * Does the current location run **rail-less** (Pattern E — no left context
 * column)?
 *
 * True for every desk-chrome surface (the Shipping desk — To ship · Amazon Prep
 * · Labels — and the `/dashboard` outbound domain) plus the Inbound desk
 * (`/incoming`). False elsewhere: scan stations keep their recents,
 * `/dashboard` inbound / sales keep their pickers, and `/shipping/scan-out`
 * keeps its station rail because it is not a desk-chrome page.
 *
 * Wraps the pure {@link isDeskStageSurface} with the pathname + params the
 * frame has. One consumer: `ContextPanelLayout`, which subtracts this from
 * `hasPanel` so the column collapses instead of reserving width the desk stage
 * was measured to give back.
 */
export function useIsDeskStageSurface(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return isDeskStageSurface(pathname, searchParams);
}
