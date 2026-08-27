/**
 * Mobile homepage — redesigned dashboard.
 *
 * A SERVER component so the receiving feed it mounts can be seeded into the
 * first HTML (`seedMobileReceivingFeed`). The feed is this screen's largest
 * contentful element; without the seed it painted only after the bundle had
 * hydrated and the client fetch had returned.
 */

import RedesignedMobileDashboard from '@/components/mobile/redesign/Dashboard';
import { ShellQuerySeed } from '@/components/providers/ShellQuerySeed';
import { seedMobileReceivingFeed } from '@/lib/queries/mobile-feed-seed.server';

export default async function MobileHomePage() {
  const seed = await seedMobileReceivingFeed('unbox');
  return (
    <ShellQuerySeed state={seed}>
      <RedesignedMobileDashboard />
    </ShellQuerySeed>
  );
}
