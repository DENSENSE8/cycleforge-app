'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { isRaillessSurface } from '@/lib/sidebar-navigation';

/**
 * Does the current location run **rail-less** (Pattern E — no left context
 * column)?
 *
 * True for every desk-chrome surface that declares `railless` (Shipping desk —
 * To ship · Amazon Prep · Labels · Shipped — and the `/dashboard` outbound
 * domain), the Inbound desk (`/incoming`), and **Scan out** (mobile-first
 * composer: full-bleed center, no left recents). False elsewhere: other scan
 * stations keep their recents; `/dashboard` inbound / sales keep their pickers.
 *
 * Wraps the pure {@link isRaillessSurface} with the pathname + params the
 * frame has. One consumer: `ContextPanelLayout`, which subtracts this from
 * `hasPanel` so the column collapses instead of reserving width the desk stage
 * was measured to give back.
 */
export function useIsRaillessSurface(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return isRaillessSurface(pathname, searchParams);
}
