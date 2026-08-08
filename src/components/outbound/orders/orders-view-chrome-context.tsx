'use client';

/**
 * Cross-tree bridge for To Ship View topics — sheet layout / refine chrome lives
 * in the pushing right inspector while grid-owned ▦ / lane-owned date controls
 * stay under {@link DashboardOrdersView}. Staff composes directly in the View
 * cluster, matching Unbox History.
 *
 * Provider mounts on {@link OutboundOrdersDesk} so the collection + every order
 * rail occupant share one controls portal target + KPI collapse + View-only
 * shell state.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useWorkbenchKpiCollapsed } from '@/hooks/useWorkbenchKpiCollapsed';
import { WORKBENCH_KPI_SURFACE } from '@/components/dashboard/workbench-kpi-collapse';

type OrdersViewChromeValue = {
  /** Portal host for grid-owned ▦ + lane-owned date controls. */
  controlsEl: HTMLElement | null;
  setControlsEl: (el: HTMLElement | null) => void;
  kpiOpen: boolean;
  onToggleKpi: () => void;
  /** View-only shell open (no selected order) — Band 3 can open layout chrome. */
  viewShellOpen: boolean;
  setViewShellOpen: (open: boolean) => void;
};

const OrdersViewChromeContext = createContext<OrdersViewChromeValue | null>(null);

export function OrdersViewChromeProvider({ children }: { children: ReactNode }) {
  const [controlsEl, setControlsEl] = useState<HTMLElement | null>(null);
  const [viewShellOpen, setViewShellOpen] = useState(false);
  const { collapsed: kpiCollapsed, toggleCollapsed: onToggleKpi } =
    useWorkbenchKpiCollapsed(WORKBENCH_KPI_SURFACE.outbound);

  const value = useMemo(
    () => ({
      controlsEl,
      setControlsEl,
      kpiOpen: !kpiCollapsed,
      onToggleKpi,
      viewShellOpen,
      setViewShellOpen,
    }),
    [controlsEl, kpiCollapsed, onToggleKpi, viewShellOpen],
  );

  return (
    <OrdersViewChromeContext.Provider value={value}>
      {children}
    </OrdersViewChromeContext.Provider>
  );
}

/**
 * Re-provides the chrome across a `RightRailHost` re-parent. Registered rail
 * nodes render inside the host's subtree, not where their JSX was written.
 */
export function OrdersViewChromeBridge({
  value,
  children,
}: {
  value: OrdersViewChromeValue | null;
  children: ReactNode;
}) {
  return (
    <OrdersViewChromeContext.Provider value={value}>
      {children}
    </OrdersViewChromeContext.Provider>
  );
}

export function useOrdersViewChrome(): OrdersViewChromeValue {
  const ctx = useContext(OrdersViewChromeContext);
  if (!ctx) {
    throw new Error('useOrdersViewChrome requires OrdersViewChromeProvider');
  }
  return ctx;
}

/** Safe read when the provider may be absent (non–To Ship mounts). */
export function useOrdersViewChromeOptional(): OrdersViewChromeValue | null {
  return useContext(OrdersViewChromeContext);
}
