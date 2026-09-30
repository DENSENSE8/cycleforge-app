'use client';

/**
 * A repair scanned at the Picker desk (`handleRepairScan` → `open-repair-details`)
 * opens the repair's ONE record — the Repair desk's `?openRepair=` — never a
 * side rail (the `DeskRecordPlane` law: no record registers with the right rail).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { taskLinkRepairHref } from '@/lib/tasks/task-links-shared';

export function useOpenScannedRepair(): void {
  const router = useRouter();
  useEffect(() => {
    const open = (event: Event) => {
      const repairId = Number((event as CustomEvent<{ repairId: number }>).detail?.repairId);
      if (Number.isFinite(repairId) && repairId > 0) router.push(taskLinkRepairHref(repairId, 'desk'));
    };
    window.addEventListener('open-repair-details', open);
    return () => window.removeEventListener('open-repair-details', open);
  }, [router]);
}
