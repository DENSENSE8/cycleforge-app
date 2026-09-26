/**
 * Print one product label per receiving line — serial-level when serials are
 * loaded on the row, else a single SKU label. Same pipeline as the Unbox
 * bench's Pass + Print; shared by the receiving bulk bar and the carton record.
 *
 * Before printing, every serial's canonical `unit_uid` is resolved in ONE batch
 * call and threaded as the qrPayload, so a reprint encodes the SAME minted id
 * the unit was born with — not a bare `U-{serial}` fallback. A serial with no
 * minted uid degrades to the bare-serial encoding; a failed resolve never
 * blocks the print. Known units are recorded in `label_print_jobs` (best-effort).
 */

import { printProductLabel, printProductLabels } from '@/lib/print/printProductLabel';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { ReceivingLineRow } from './receiving-line-row';

type ResolvedUnit = { unitUid: string; serialUnitId: number | null };

function lineSerials(row: ReceivingLineRow): string[] {
  return (row.serials ?? []).map((s) => (s.serial_number || '').trim()).filter(Boolean);
}

async function resolveUnits(serials: readonly string[]): Promise<Map<string, ResolvedUnit>> {
  const unitBySerial = new Map<string, ResolvedUnit>();
  if (serials.length === 0) return unitBySerial;
  try {
    const res = await fetch('/api/serial-units/resolve-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serials }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        units?: Array<{ serial: string; unit_uid: string | null; serial_unit_id: number | null }>;
      };
      for (const u of json.units ?? []) {
        if (u.unit_uid) {
          unitBySerial.set(u.serial.trim().toUpperCase(), {
            unitUid: u.unit_uid,
            serialUnitId: u.serial_unit_id ?? null,
          });
        }
      }
    }
  } catch {
    // Degrade: fall back to the bare-serial encoding on resolve failure.
  }
  return unitBySerial;
}

/** Print every label the lines own; toasts the count (or that no line has a SKU). */
export async function printReceivingLineLabels(rows: readonly ReceivingLineRow[]): Promise<void> {
  const allSerials = Array.from(new Set(rows.flatMap(lineSerials)));
  const unitBySerial = await resolveUnits(allSerials);

  let printed = 0;
  const jobs: Array<{
    jobType: 'REPRINT';
    serialUnitId: number | null;
    unitUid: string;
    qrPayload: string;
    symbology: 'datamatrix';
    templateId: 'product';
    isReprint: true;
    clientEventId: string;
  }> = [];
  const batchId = safeRandomUUID();
  for (const r of rows) {
    const sku = (r.sku || '').trim();
    if (!sku) continue;
    const serials = lineSerials(r);
    if (serials.length > 0) {
      const qrPayloads = serials.map((s) => unitBySerial.get(s.toUpperCase())?.unitUid ?? undefined);
      printProductLabels({ sku, serialNumbers: serials, qrPayloads });
      printed += serials.length;
      for (const s of serials) {
        const unit = unitBySerial.get(s.toUpperCase());
        if (unit) {
          jobs.push({
            jobType: 'REPRINT',
            serialUnitId: unit.serialUnitId,
            unitUid: unit.unitUid,
            qrPayload: unit.unitUid,
            symbology: 'datamatrix',
            templateId: 'product',
            isReprint: true,
            clientEventId: `bulk-reprint-${batchId}:${s.toUpperCase()}`,
          });
        }
      }
    } else {
      printProductLabel({ sku });
      printed += 1;
    }
  }
  if (printed > 0) toast.success(`Printing ${printed} label${printed === 1 ? '' : 's'}`);
  else toast.error(rows.length === 1 ? 'This line has no SKU to print' : 'No SKU on the selected line(s)');

  // Record the reprints into the ledger (best-effort; the label already
  // printed). Idempotent per (org, clientEventId) so a retry is a no-op.
  if (jobs.length > 0) {
    void fetch('/api/label-print-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs }),
    }).catch(() => {
      /* ledger logging is best-effort; never block the print */
    });
  }
}
