'use client';

import type { ReactNode } from 'react';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

/**
 * One subscription for every repair workbench screen: `repair.changed`
 * (status, fields, photos, pickup, links — from any device) invalidates
 * `qk.repairs.all`, which covers the cached `qk.repairs.workbench` reads. That
 * is what lets those reads be cached across hub ↔ sub-screen navigation
 * instead of refetched on every mount. Mounted here, not per page, so moving
 * between the screens keeps one live channel.
 */
export default function RepairWorkbenchLayout({ children }: { children: ReactNode }) {
  useRealtimeInvalidation({ repair: true });
  return children;
}
