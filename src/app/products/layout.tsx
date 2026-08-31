import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/**
 * `/products` — the Products **desk**.
 *
 * Two jobs, and they are unrelated:
 *
 * 1. The boundary parse for the whole surface, including the
 *    `/products/sku/[sku]` detail child that PRODUCTS_ROUTE_PARAMS governs by
 *    prefix. It used to live in `ProductsSidebarPanel`, which is mounted by
 *    `SidebarContextPanel` on desktop but rides `RouteShell`'s `actions` slot on
 *    mobile — and mobile renders one pane at a time, defaulting to `history`. So
 *    on a phone the parse never ran: a probe param survived every load.
 *    Placement rules: `@/components/routing/SurfaceParamHygiene`.
 *
 * 2. The desk frame (2026-08-31). Reference · Manuals · SKU Barcodes · Pairing ·
 *    Listing match were spine drill-downs; they are now in-page tabs on the one
 *    page chrome every non-scan desk wears
 *    ({@link DeskPageChrome}, `@/design-system/components/DeskPageChrome`).
 *
 * **The catalog rail stays.** Products is `deskChrome` but not `railless`: the
 * LibraryBrowser and the SKU pickers write the `?id=` / `?skuId=` this page's
 * bodies read, so the left column is the navigator, not decoration. The stage
 * cap is a max-width, so beside the rail it simply never reaches 1152.
 */
export default function ProductsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout className="h-full">{children}</DeskPageLayout>
    </>
  );
}
