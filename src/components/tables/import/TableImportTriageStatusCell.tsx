'use client';

/**
 * Ready / Action-required chip — the ONE paint for table-import triage.
 * To-ship CSV staging and Shortage coverage staging both mount this.
 */

import { GridStatusCellValue } from '@/components/ui/grid-cells';
import {
  tableImportTriagePaint,
  type TableImportTriageStatus,
} from '@/lib/orders/shortage-coverage';

export function TableImportTriageStatusCell({
  status,
  tooltip,
}: {
  status: TableImportTriageStatus;
  tooltip?: string | null;
}) {
  const paint = tableImportTriagePaint(status);
  return (
    <GridStatusCellValue
      label={paint.label}
      toneClass={paint.toneClass}
      dotClass={paint.dotClass}
      tooltip={tooltip}
    />
  );
}
