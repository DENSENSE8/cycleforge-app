'use client';

import type { ReactNode } from 'react';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

/** One subscription for every repair workbench screen: */
export default function RepairWorkbenchLayout({ children }: { children: ReactNode }) {
  useRealtimeInvalidation({ repair: true });
  return children;
}
