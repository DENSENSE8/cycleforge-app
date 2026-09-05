/**
 * /m/scan — Universal mobile scan entry point.
 *
 * A SERVER component so the Receiving · Prioritize feed — the default panel and
 * this screen's largest contentful element — is in the first HTML rather than
 * arriving strictly after hydrate + fetch.
 *
 * The seed is capped at one screen. It used to ask for **500 rows** to "mirror
 * the panel's request window"; the panel windows to one screen regardless, so
 * the other 480 were pure document weight. See `mobile-feed-seed.server.ts`.
 */

import { HydrationBoundary } from '@tanstack/react-query';
import RedesignedMobileUniversalScan from '@/components/mobile/redesign/UniversalScan';
import { seedMobileScanPrioritize } from '@/lib/queries/mobile-feed-seed.server';

export default async function MobileScanPage() {
  const seed = await seedMobileScanPrioritize();
  return (
    <HydrationBoundary state={seed}>
      <RedesignedMobileUniversalScan />
    </HydrationBoundary>
  );
}
