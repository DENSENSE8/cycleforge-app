import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { RepairScanCompanion } from '@/components/mobile/repair/RepairScanCompanion';

export const metadata: Metadata = { title: 'Repair serials' };

/** `/m/repair-scan?t=<token>` — a staff phone joined to a counter tablet's repair visit, scanning serial numbers into it. */
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
