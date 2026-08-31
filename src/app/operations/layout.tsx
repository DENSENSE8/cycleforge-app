import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/**
 * `/operations` — the Operations **desk** frame (2026-08-31).
 *
 * Live · Checks · Packing Review · Analytics · Reconcile were spine
 * drill-downs; they are now in-page tabs on the one chrome every non-scan desk
 * wears ({@link DeskPageChrome}, `@/design-system/components/DeskPageChrome`).
 * The modes ride `?mode=` on this single route, so the layout is the tab host.
 *
 * **The monitor rail stays.** `deskChrome` without `railless`.
 */
export default function OperationsLayout({ children }: { children: ReactNode }) {
  return <DeskPageLayout className="h-full">{children}</DeskPageLayout>;
}
