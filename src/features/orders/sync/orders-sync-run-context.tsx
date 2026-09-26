'use client';

/** The seam that lets the order table step aside for a run. */

import { createContext, useContext, type ReactNode } from 'react';
import type { SyncRunDetail } from '@/lib/orders-sync/run-detail';
import type { SyncRunOutcomeLine, SyncRunState } from '@/lib/orders-sync/run-steps';

export interface OrdersSyncRunSurface {
  /** Null when no run has been started, or after the operator acknowledged one. */
  run: SyncRunState | null;
  elapsedMs: number;
  isRunning: boolean;
  outcome: SyncRunOutcomeLine | null;
  /** Per-row record for the settled run. Null while nothing is known. */
  detail: SyncRunDetail | null;
  /** Scripted sample data, not a real import. */
  demo: boolean;
  cancel: () => void;
  /** Acknowledge the result; the table comes back. */
  dismiss: () => void;
}

const OrdersSyncRunContext = createContext<OrdersSyncRunSurface | null>(null);

export function OrdersSyncRunProvider({
  value,
  children,
}: {
  value: OrdersSyncRunSurface;
  children: ReactNode;
}) {
  return <OrdersSyncRunContext.Provider value={value}>{children}</OrdersSyncRunContext.Provider>;
}

/**
 * Null outside the desk (a station embed, a modal-hosted table) — the table
 * keeps painting and nothing pretends a run exists. Same discipline as
 * `useDeskStageOptional`.
 */
export function useOrdersSyncRunOptional(): OrdersSyncRunSurface | null {
  return useContext(OrdersSyncRunContext);
}
