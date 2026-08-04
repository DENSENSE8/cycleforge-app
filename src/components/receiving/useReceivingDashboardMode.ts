'use client';

/**
 * Parses the receiving right-pane mode. The graduated surface routes (`/unbox`,
 * `/triage`, `/repair`, …) carry no `?mode=` — being on the route IS the mode —
 * so the mode is derived path-first, then from `?mode=` for the legacy
 * `/receiving` page. History + Incoming + Repair are table-only (they hide the
 * workspace overlay even if one is open in state, so a quick peek doesn't lose
 * unfinished edits).
 *
 * `/incoming?lane=docked` is the Docked feed (former Receiving Board) and
 * resolves as history for pane/overlay purposes.
 */

import { useSearchParams, usePathname } from 'next/navigation';
import { parseIncomingView, type IncomingView } from '@/lib/receiving/incoming-view';
import { parseInboundLane } from '@/lib/receiving/inbound-lane';
import {
  UNBOX_SURFACE_ROUTE,
  TRIAGE_SURFACE_ROUTE,
  INCOMING_SURFACE_ROUTE,
  PICKUP_SURFACE_ROUTE,
  REPAIR_SURFACE_ROUTE,
  HISTORY_SURFACE_ROUTE,
} from '@/lib/receiving/surface-path';

export interface ReceivingDashboardMode {
  mode: string;
  isTriageMode: boolean;
  isHistoryMode: boolean;
  isIncomingMode: boolean;
  isRepairMode: boolean;
  isTableOnlyMode: boolean;
  /** Incoming right-pane sub-view from `?incview=` (`pos` default | `email` | `removed`). */
  incomingView: IncomingView;
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
  const incomingView: IncomingView = parseIncomingView(searchParams.get('incview'));
  return {
    mode,
    isTriageMode: mode === 'triage',
    isHistoryMode,
    isIncomingMode,
    isRepairMode,
    isTableOnlyMode: isHistoryMode || isIncomingMode || isRepairMode,
    incomingView,
  };
}
