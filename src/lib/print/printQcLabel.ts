/**
 * The QC / pre-box unit sticker (template `product`, 2×1): print it on THIS
 * computer and record it in `label_print_jobs`. One choke point for the
 * Inventory › QC labels desk and for a print station taking a phone's
 * `qc_label` job.
 */

import { qcLabelHandle, type QcLabelPrintUnit } from '@/lib/labels/qc-label-row';
import type { StaffPrintQcLabelPayload } from '@/lib/print/staff-print-bridge';
import { printProductLabel } from '@/lib/print/printProductLabel';
import { beginWork } from '@/lib/background-work/store';

/** Print one unit's QC label and record the sticker (`label_print_jobs`). */
export async function printQcLabel(unit: QcLabelPrintUnit, clientEventId?: string): Promise<void> {
  const handle = qcLabelHandle(unit);
  printProductLabel({
    sku: unit.sku ?? '',
    title: unit.title,
    serialNumber: unit.serial_number ?? undefined,
    qrPayload: handle,
    condition: unit.condition_grade,
  });
  const res = await fetch('/api/label-print-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobs: [
        {
          jobType: unit.printed ? 'REPRINT' : 'UNIT',
          serialUnitId: unit.serial_unit_id,
          unitUid: unit.unit_uid,
          qrPayload: handle,
          templateId: 'product',
          isReprint: unit.printed,
          ...(clientEventId ? { clientEventId } : {}),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Printed, but the print record failed (${res.status})`);
}

/** The unit a QC label print names, looked up under THIS computer's session. */
export async function fetchQcLabelPrintUnit(unitKey: string): Promise<QcLabelPrintUnit | string> {
  const res = await fetch(`/api/inventory/qc-labels/unit?scan=${encodeURIComponent(unitKey)}`, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as { unit?: QcLabelPrintUnit; error?: string } | null;
  if (!res.ok || !json?.unit) return json?.error ?? `Could not load ${unitKey} for its QC label (${res.status})`;
  return json.unit;
}

/**
 * Station side of a phone-sent QC label (`grain: 'qc_label'`): look the unit up
 * here, print, log. Returns the operator-facing failure, or null once printed.
 */
export async function printQcLabelStationJob(job: StaffPrintQcLabelPayload, requestId: string): Promise<string | null> {
  const work = beginWork({ kind: 'print', label: `QC label ${job.unitKey}` });
  try {
    const unit = await fetchQcLabelPrintUnit(job.unitKey);
    if (typeof unit === 'string') {
      work.fail(unit);
      return unit;
    }
    await printQcLabel(unit, requestId);
    work.finish('Printed');
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The QC label did not print.';
    work.fail(message);
    return message;
  }
}
