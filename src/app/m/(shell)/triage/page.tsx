/**
 * /m/triage — Mobile Arrival Station (door scan → photos → classify).
 *
 * Server component: the arrival feed is seeded into the first HTML (see
 * `/m/home` for why).
 */

import MobileArrivalStation from '@/components/mobile/receiving/MobileArrivalStation';
import { ShellQuerySeed } from '@/components/providers/ShellQuerySeed';
import { seedMobileReceivingFeed } from '@/lib/queries/mobile-feed-seed.server';

export default async function MobileTriageScanPage() {
  const seed = await seedMobileReceivingFeed('triage');
  return (
    <ShellQuerySeed state={seed}>
      <MobileArrivalStation />
    </ShellQuerySeed>
  );
}
