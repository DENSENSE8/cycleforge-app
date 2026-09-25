'use client';

import type { ReactNode } from 'react';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

/**
 * One receiving-feed subscription for every screen of a carton (hub, /info,
 * lines, activity, QC): a change from any device invalidates the `receiving`
 * prefix, which holds `qk.cartons.hub`, so hub ↔ door moves stay cache hits.
 */
export function CartonRealtime({ children }: { children: ReactNode }) {
  useRealtimeInvalidation({ receiving: true });
  return children;
}
