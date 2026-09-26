import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { RepairScanVisitInfo } from '@/components/mobile/repair/RepairScanVisitInfo';

export const metadata: Metadata = { title: 'Visit details' };

/**
 * `/m/repair-scan/info?t=<token>` — the joined visit's facts, opened from the
 * repair-scan hub's summary card. Same gate and token as the hub.
 */
export default async function MobileRepairScanInfoPage({
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
  return <RepairScanVisitInfo token={t} />;
}
