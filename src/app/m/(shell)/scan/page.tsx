/**
 * /m/scan — identification kernel (packages + PO tracking).
 *
 * Server-seeded from the receiving feed so the tape paints without a fetch.
 */

import MobileScanIdentify from '@/components/mobile/scan/MobileScanIdentify';
import { ShellQuerySeed } from '@/components/providers/ShellQuerySeed';
import { seedMobileReceivingFeed } from '@/lib/queries/mobile-feed-seed.server';

export default async function MobileScanPage() {
  const seed = await seedMobileReceivingFeed('triage');
  return (
    <ShellQuerySeed state={seed}>
      <MobileScanIdentify />
    </ShellQuerySeed>
  );
}
