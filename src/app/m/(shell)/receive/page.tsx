/**
 * /m/receive — deprecated Arrival alias. Prefer `/m/triage`.
 *
 * Server component: the arrival feed is seeded into the first HTML, projected
 * to the fields the first screen paints (see `/m/home`).
 */

import MobileArrivalStation from '@/components/mobile/receiving/MobileArrivalStation';
import { ShellQuerySeed } from '@/components/providers/ShellQuerySeed';
import { seedMobileReceivingFeed } from '@/lib/queries/mobile-feed-seed.server';

/** @deprecated Prefer `/m/triage` — kept for deep links. */
export default async function MobileReceivePage() {
  const seed = await seedMobileReceivingFeed('triage');
  return (
    <ShellQuerySeed state={seed}>
      <MobileArrivalStation />
    </ShellQuerySeed>
  );
}
