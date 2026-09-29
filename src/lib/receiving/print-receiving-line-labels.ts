/** Print one product label per physical receiving unit through the canonical unit-identity writer. */

import { printProductLabel } from '@/lib/print/printProductLabel';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { ReceivingLineRow } from './receiving-line-row';

interface IssuedUnitLabel {
  serialUnitId: number;
  unitUid: string;
  sku: string;
  title: string;
  serialNumber: string | null;
  condition: string | null;
  qrPayload: string;
  isReprint: boolean;
  clientEventId: string;
}

/** Print every label the lines own; toasts the count (or that no line has a SKU). */
export async function printReceivingLineLabels(rows: readonly ReceivingLineRow[]): Promise<void> {
  await printReceivingLineLabelsByIds(rows.map((row) => row.id));
}

export interface ReceivingLineLabelPrintResult {
  printed: number;
  failedLines: number;
  failedLineIds: number[];
}

/** The same canonical print path for read models that carry only line ids. */
export async function printReceivingLineLabelsByIds(
  lineIds: readonly number[],
): Promise<ReceivingLineLabelPrintResult> {
  const printableIds = [...new Set(lineIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (printableIds.length === 0) {
    toast.error(lineIds.length === 1 ? 'Save this line before printing labels' : 'No saved lines to print');
    return { printed: 0, failedLines: 0, failedLineIds: [] };
  }

  const batchId = safeRandomUUID().replaceAll('-', '_');
  const issued: IssuedUnitLabel[] = [];
  const failures: string[] = [];
  const failedLineIds: number[] = [];
  for (const lineId of printableIds) {
    try {
      const response = await fetch(`/api/receiving/lines/${lineId}/unit-labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issuanceVersion: batchId }),
      });
      const json = (await response.json().catch(() => null)) as
        | { success?: boolean; labels?: IssuedUnitLabel[]; error?: string }
        | null;
      if (!response.ok || !json?.success) {
        failures.push(json?.error || `Could not issue labels for line ${lineId}`);
        failedLineIds.push(lineId);
        continue;
      }
      issued.push(...(json.labels ?? []));
    } catch {
      failures.push(`Could not issue labels for line ${lineId}`);
      failedLineIds.push(lineId);
    }
  }

  if (issued.length === 0) {
    toast.error(failures[0] || 'No physical units are ready to label');
    return { printed: 0, failedLines: failures.length, failedLineIds };
  }

  issued.forEach((label, index) => {
    window.setTimeout(() => {
      printProductLabel({
        sku: label.sku,
        title: label.title,
        serialNumber: label.serialNumber ?? undefined,
        qrPayload: label.qrPayload,
        condition: label.condition,
      });
    }, index * 200);
  });

  const jobs: Array<{
    jobType: 'UNIT' | 'REPRINT';
    serialUnitId: number;
    unitUid: string;
    qrPayload: string;
    symbology: 'datamatrix';
    templateId: 'product';
    isReprint: boolean;
    clientEventId: string;
  }> = issued.map((label) => ({
    jobType: label.isReprint ? 'REPRINT' : 'UNIT',
    serialUnitId: label.serialUnitId,
    unitUid: label.unitUid,
    qrPayload: label.qrPayload,
    symbology: 'datamatrix',
    templateId: 'product',
    isReprint: label.isReprint,
    clientEventId: label.clientEventId,
  }));
  toast.success(`Printing ${issued.length} item label${issued.length === 1 ? '' : 's'}`);
  if (failures.length > 0) {
    toast.error(`${failures.length} line${failures.length === 1 ? '' : 's'} could not print`);
  }

  // The browser owns the physical print gesture. Record only after dispatch;
  // retrying this request is safe because every unit carries its own key.
  try {
    const ledger = await fetch('/api/label-print-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs }),
    });
    if (!ledger.ok) toast.error('Labels printed, but their print record failed');
  } catch {
    toast.error('Labels printed, but their print record failed');
  }
  return { printed: issued.length, failedLines: failures.length, failedLineIds };
}
