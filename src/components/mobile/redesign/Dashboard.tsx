'use client';

/**
 * Mobile homepage — Home.
 *
 * Above the receiving feed sits an inset grouped "Orders" card: the signed-in
 * staffer's three most urgent to-ship assignments, with a view-all action to
 * `/m/work`. When nothing is assigned, that empty body is still the door to
 * the full to-ship list. The header (title + chevron) is structural — it does
 * not wait on the mine fetch — so the SSR-seeded receiving feed below still
 * paints with the document. The three rows hydrate into the same card.
 *
 * Home shows the shared receiving feed (same source as the Receiving tab),
 * capped so it fills one phone screen. Previously this read /api/scan/history,
 * which is gated on an inventory permission floor staff lack — so it was
 * permanently blank. Now it reuses MobileReceivingList, which all the mobile
 * feeds share.
 */

import { Inset } from '@/design-system/primitives';
import { MobileReceivingList } from '@/components/mobile/receiving/MobileReceivingList';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { MobileAssignedOrdersGroup } from '@/components/mobile/redesign/MobileAssignedOrdersGroup';

export default function RedesignedMobileDashboard() {
  return (
    <div className={`flex h-full flex-col ${TOKENS.colors.background}`}>
      <Inset space="card" className="shrink-0">
        <MobileAssignedOrdersGroup />
      </Inset>

      {/* Header lives in the shell; nav moved to the left drawer, so the feed
          runs to the bottom (shell's pb-safe clears the home indicator). */}
      <div className="min-h-0 flex-1 pb-3">
        <MobileReceivingList limit={25} />
      </div>
    </div>
  );
}
