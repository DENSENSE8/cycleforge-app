import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/**
 * `/products` — the boundary parse for the whole surface, including the
 * `/products/sku/[sku]` detail child that PRODUCTS_ROUTE_PARAMS governs by prefix.
 *
 * It used to live in `ProductsSidebarPanel`, which is mounted by
 * `SidebarContextPanel` on desktop but rides `RouteShell`'s `actions` slot on
 * mobile — and mobile renders one pane at a time, defaulting to `history`. So on a
 * phone the parse never ran: a probe param survived every load. Placement rules:
 * `@/components/routing/SurfaceParamHygiene`.
 */
export default function ProductsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      {children}
    </>
  );
}
