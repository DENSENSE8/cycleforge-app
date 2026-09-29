'use client';

import { useSearchParams } from 'next/navigation';
import { getShippingWorkspaceTabFromSearch } from '@/utils/shipping-workspace-state';

/** URL SoT for the Picker desk workspace view on `/pick` (`?ship=`). */
export function useShippingWorkspaceTab() {
  const searchParams = useSearchParams();
  return { shipTab: getShippingWorkspaceTabFromSearch(searchParams) };
}
