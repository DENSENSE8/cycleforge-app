/**
 * Mobile homepage — redesigned dashboard.
 *
 * A SERVER component so the receiving feed it mounts is seeded into the first
 * HTML. The feed is this screen's largest contentful element; without it in the
 * document, LCP cannot resolve until the bundle has hydrated and the client
 * fetch has returned, which Lantern charges 4-5x under the mobile profile.
 *
 * The seed is PROJECTED to the ~19 fields the first screen renders — see
 * `mobile-feed-seed.server.ts` for the measurement that made that the whole
 * point. Seeding whole 101-field records instead put 461KB in this document and
 * scored WORSE than no seed at all.
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
