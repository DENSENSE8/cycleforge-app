'use client';

/** Parses the receiving right-pane mode. */

import { useSearchParams, usePathname } from 'next/navigation';
import { parseInboundLane } from '@/lib/receiving/inbound-lane';
import {
  UNBOX_SURFACE_ROUTE,
  TRIAGE_SURFACE_ROUTE,
  INCOMING_SURFACE_ROUTE,
  PICKUP_SURFACE_ROUTE,
  REPAIR_SURFACE_ROUTE,
  HISTORY_SURFACE_ROUTE,
} from '@/lib/receiving/surface-path';

interface ReceivingDashboardMode {
  mode: string;
  isTriageMode: boolean;
  isHistoryMode: boolean;
  isIncomingMode: boolean;
  isRepairMode: boolean;
  isTableOnlyMode: boolean;
}

export function useReceivingDashboardMode(): ReceivingDashboardMode {
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? '';
  // Graduated surface routes are path-based; the legacy page reads `?mode=`.
  // Inbound desk: Pipeline stays `incoming`; Docked is `history`.
  const mode = pathname.startsWith(HISTORY_SURFACE_ROUTE)
    ? 'history'
    : pathname.startsWith(UNBOX_SURFACE_ROUTE)
      ? 'receive'
      : pathname.startsWith(TRIAGE_SURFACE_ROUTE)
        ? 'triage'
        : pathname.startsWith(INCOMING_SURFACE_ROUTE)
          ? parseInboundLane(searchParams.get('lane')) === 'docked'
            ? 'history'
            : 'incoming'
          : pathname.startsWith(PICKUP_SURFACE_ROUTE)
            ? 'pickup'
            : pathname.startsWith(REPAIR_SURFACE_ROUTE)
              ? 'repair'
              : searchParams.get('mode') ?? 'receive';
  const isHistoryMode = mode === 'history';
  const isIncomingMode = mode === 'incoming';
  const isRepairMode = mode === 'repair';
  return {
    mode,
    isTriageMode: mode === 'triage',
    isHistoryMode,
    isIncomingMode,
    isRepairMode,
    isTableOnlyMode: isHistoryMode || isIncomingMode || isRepairMode,
  };
}
