'use client';

/** Cross-tree bridge for To Ship View topics — sheet layout / refine chrome lives in the pushing right inspector while grid-owned ▦ /… */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type OrdersViewChromeValue = {
  /** View-only shell open (no selected order) — Band 3 can open layout chrome. */
  viewShellOpen: boolean;
  setViewShellOpen: (open: boolean) => void;
};

const OrdersViewChromeContext = createContext<OrdersViewChromeValue | null>(null);

export function OrdersViewChromeProvider({ children }: { children: ReactNode }) {
  const [viewShellOpen, setViewShellOpen] = useState(false);

  const value = useMemo(
    () => ({ viewShellOpen, setViewShellOpen }),
    [viewShellOpen],
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
