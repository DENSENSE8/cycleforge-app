import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { RepairScanCompanion } from '@/components/mobile/repair/RepairScanCompanion';

export const metadata: Metadata = { title: 'Repair serials' };

/**
 * `/m/repair-scan?t=<token>` — a staff phone joined to a counter tablet's
 * repair visit, scanning serial numbers into it. Reached from the QR on the
 * tablet's Device & quote step, never from the nav: without a token there is
 * no visit to join.
 *
 * Gated on `walk_in.intake`, the same permission as editing a counter line; a
 * phone that is not signed in is sent through sign-in and back here.
 */
export default async function MobileRepairScanPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  await requirePermission('walk_in.intake');
  const { t } = await searchParams;
  if (!t) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-card px-8 text-center text-sm text-text-soft">
        Scan the QR on the counter tablet to join its repair visit.
      </div>
    );
  }
  return <RepairScanCompanion token={t} />;
}
