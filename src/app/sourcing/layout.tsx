import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/**
 * `/sourcing` — the Sourcing **desk** frame (2026-08-31).
 *
 * Queue · Scout · Watchlist · Searches · Suppliers were spine drill-downs; they
 * are now in-page tabs on the one chrome every non-scan desk wears
 * ({@link DeskPageChrome}, `@/design-system/components/DeskPageChrome`). The
 * modes ride `?mode=` on this single route, so the layout is the tab host and
 * the page body never remounts on a switch.
 *
 * **The sourcing rail stays.** `deskChrome` without `railless`: the demand /
 * result pickers are how this desk is navigated.
 *
 * The boundary parse stays in `page.tsx` — it is a `SurfaceParamHygiene` mount
 * this surface already places correctly, and moving it would be a second change
 * wearing the first one's commit.
 */
export default function SourcingLayout({ children }: { children: ReactNode }) {
  return <DeskPageLayout className="h-full">{children}</DeskPageLayout>;
}
