'use client';

/**
 * The seam that lets the order table step aside for a run.
 *
 * `OutboundOrdersDesk` owns `useOrdersSync` (one hook, one run — calling it
 * twice would start two imports), but the surface that has to yield the stage
 * is `DashboardOrdersView`, two levels down. This publishes the active run to
 * it, exactly as `DeskStageContext` publishes fullscreen state to a table.
 *
 * It carries BOTH the live run and the scripted demo behind one shape on
 * purpose: the run view must not be able to tell them apart (operator
 * 2026-09-15 — the real button "would display exactly the same").
 */

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
