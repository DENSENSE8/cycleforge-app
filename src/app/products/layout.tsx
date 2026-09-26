import type { ReactNode } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/** `/products` — the Products **desk**. */
export default function ProductsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout className="h-full">{children}</DeskPageLayout>
    </>
  );
}
