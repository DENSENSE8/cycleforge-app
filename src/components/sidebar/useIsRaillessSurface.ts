'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { isRaillessSurface } from '@/lib/sidebar-navigation';

/** Does the current location run **rail-less** (Pattern E — no left context column)? */
export function useIsRaillessSurface(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return isRaillessSurface(pathname, searchParams);
}
