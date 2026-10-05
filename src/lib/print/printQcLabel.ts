/**
 * The QC / pre-box unit sticker (template `product`, 2×1): print it on THIS
 * computer and record it in `label_print_jobs`. One choke point for the
 * Inventory › QC labels desk and for a print station taking a phone's
 * `qc_label` job.
 */

import { qcLabelHandle, type QcLabelPrintUnit } from '@/lib/labels/qc-label-row';
import type { StaffPrintQcLabelPayload } from '@/lib/print/staff-print-bridge';
import { printProductLabel } from '@/lib/print/printProductLabel';
import type { PrintProductLabelInput } from '@/lib/print/unitLabelCore';
import { beginWork } from '@/lib/background-work/store';

export interface QcLabelStationJobApi {
  /** Device-authenticated unit lookup, or the staff-session lookup by default. */
  unitUrl: string;
  /** Device-authenticated print ledger, or the staff-session ledger by default. */
  logUrl: string;
  /** The enrolled/browser station that physically handled the label. */
  stationId?: string;
}

export interface QcLabelStationJobOptions {
  /** Reuse the bridge host's work row so progress reaches the sender. */
  workId?: string;
  api?: QcLabelStationJobApi;
}

const STAFF_QC_LABEL_API: QcLabelStationJobApi = {
  unitUrl: '/api/inventory/qc-labels/unit',
  logUrl: '/api/label-print-jobs',
};

/**
 * What a QC label's face prints — one source for the sticker and every
 * on-screen preview. A package label names the package: its SKU, condition
 * and serial count, never one member's serial.
 */
export function qcLabelFaceInput(unit: QcLabelPrintUnit): PrintProductLabelInput {
  const pkg = unit.package;
  if (pkg) {
    return {
      sku: unit.sku ?? '',
      title: unit.sku ? `${unit.sku} · ${unit.title}` : unit.title,
      qrPayload: pkg.uid,
      condition: unit.condition_grade,
      serialCount: pkg.serial_count,
    };
  }
  return {
    sku: unit.sku ?? '',
    title: unit.title,
    serialNumber: unit.serial_number ?? undefined,
    qrPayload: qcLabelHandle(unit),
    condition: unit.condition_grade,
  };
}

/**
 * Print one QC label and record the sticker (`label_print_jobs`). A unit label
 * names the unit; a package label names the package — ONE `MANIFEST` job keyed
 * by `manifest_id`, never one per member.
 */
export async function printQcLabel(
  unit: QcLabelPrintUnit,
  clientEventId?: string,
  api: QcLabelStationJobApi = STAFF_QC_LABEL_API,
): Promise<void> {
  const pkg = unit.package;
  const handle = pkg ? pkg.uid : qcLabelHandle(unit);
  printProductLabel(qcLabelFaceInput(unit));
  const job = pkg
    ? { jobType: unit.printed ? 'REPRINT' : 'MANIFEST', serialUnitId: null, manifestId: pkg.id, unitUid: handle }
    : { jobType: unit.printed ? 'REPRINT' : 'UNIT', serialUnitId: unit.serial_unit_id, unitUid: unit.unit_uid };
  const res = await fetch(api.logUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobs: [
        {
          ...job,
          qrPayload: handle,
          symbology: 'datamatrix',
          templateId: 'product',
          copies: 1,
          isReprint: unit.printed,
          ...(clientEventId ? { clientEventId } : {}),
          ...(api.stationId ? { stationId: api.stationId } : {}),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Printed, but the print record failed (${res.status})`);
}

/** The unit a QC label print names, looked up under THIS computer's session. */
export async function fetchQcLabelPrintUnit(
  unitKey: string,
  unitUrl = STAFF_QC_LABEL_API.unitUrl,
): Promise<QcLabelPrintUnit | string> {
  const separator = unitUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${unitUrl}${separator}scan=${encodeURIComponent(unitKey)}`, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as { unit?: QcLabelPrintUnit; error?: string } | null;
  if (!res.ok || !json?.unit) return json?.error ?? `Could not load ${unitKey} for its QC label (${res.status})`;
  return json.unit;
}

/**
 * Station side of a phone-sent QC label (`grain: 'qc_label'`): look the unit up
 * here, print, log. Returns the operator-facing failure, or null once printed.
 */
export async function printQcLabelStationJob(
  job: StaffPrintQcLabelPayload,
  requestId: string,
  options: QcLabelStationJobOptions = {},
): Promise<string | null> {
  const api = options.api ?? STAFF_QC_LABEL_API;
  const work = beginWork({ kind: 'print', label: `QC label ${job.unitKey}`, total: 1, id: options.workId });
  try {
    const unit = await fetchQcLabelPrintUnit(job.unitKey, api.unitUrl);
    if (typeof unit === 'string') {
      work.fail(unit);
      return unit;
    }
    await printQcLabel(unit, requestId, api);
    work.progress(1, 1);
    work.finish('Printed');
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The QC label did not print.';
    work.fail(message);
    return message;
  }
}
