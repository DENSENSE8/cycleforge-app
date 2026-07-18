import type { ReactNode } from 'react';

/**
 * `/fba` is a permanent redirect to `/shipping?mode=fba` — no dogfood parking.
 * FBA prep is hosted under Shipping (not a top-level parked surface anymore).
 */
export default function FbaLayout({ children }: { children: ReactNode }) {
  return children;
}
