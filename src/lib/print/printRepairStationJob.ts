/** Station side of a phone-sent repair print (`grain: */

import type { StaffPrintRepairPayload } from '@/lib/print/staff-print-bridge';
import { buildRepairLabelPayload, printRepairLabel } from '@/lib/print/printRepairLabel';
import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { printPackBundleFallback } from '@/lib/print/printPackBundleFallback';
import { readPrintStation } from '@/lib/print/print-station';

async function recordPaperPrint(job: StaffPrintRepairPayload, requestId: string): Promise<string | null> {
  const res = await fetch(`/api/repair-service/${job.repairId}/print-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document: job.document,
      manualId: job.manualId,
      requestId,
      stationName: readPrintStation().name,
    }),
  });
  return res.ok ? null : `Printed, but the print log did not record it (${res.status})`;
}

export async function printRepairStationJob(
  job: StaffPrintRepairPayload,
  requestId: string,
): Promise<string | null> {
  const rsCode = `RS-${job.repairId}`;

  if (job.document === 'label') {
    const res = await fetch(`/api/repair-service/${job.repairId}`, { cache: 'no-store' });
    if (!res.ok) return `Could not load ${rsCode} for its label (${res.status})`;
    const repair = (await res.json()) as {
      contact_info?: string | null;
      ticket_number?: string | null;
      created_at?: string | null;
    };
    printRepairLabel(
      buildRepairLabelPayload({
        repairId: job.repairId,
        customerName: repair.contact_info,
        ticketNumber: repair.ticket_number,
        intakeAt: repair.created_at,
      }),
    );
    const stamp = await fetch(`/api/repair-service/${job.repairId}/label-printed`, { method: 'POST' });
    return stamp.ok ? null : `Label printed, but the stamp did not land (${stamp.status})`;
  }

  if (job.document === 'receipt') {
    const res = await fetch(`/api/repair-service/print/${job.repairId}`, { cache: 'no-store' });
    if (!res.ok) return `Could not load the ${rsCode} receipt (${res.status})`;
    if (!printHtmlInIframe(await res.text(), { name: `${rsCode} receipt` })) {
      return `Could not print the ${rsCode} receipt`;
    }
    return recordPaperPrint(job, requestId);
  }

  if (!job.manualId || !printPackBundleFallback([{ kind: 'manual', productManualId: job.manualId }])) {
    return `Could not print the manual for ${rsCode}`;
  }
  return recordPaperPrint(job, requestId);
}
