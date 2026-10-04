/**
 * Mobile receiving live feed — `/m/receiving`.
 *
 * A plain mount. The `?mode=` read (and the Suspense boundary
 * `useSearchParams` forced) went with the Walk-In / Repair rows on 2026-09-15:
 * the feed is the whole surface, so there is no sub-surface left to select.
 */

import MobileV2ReceivingLive from '@/components/mobile/v2/receiving/MobileV2ReceivingLive';

export default function MobileReceivingLivePage() {
  return <MobileV2ReceivingLive />;
}
