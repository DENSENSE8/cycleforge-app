'use client';

import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { buildLabelHtml } from '@/lib/print/printLabel';
import { buildFaceInfoHtml } from '@/lib/print/labelFace';
import {
  receivingPayloadToFace,
  resolveReceivingQrValue,
  type ReceivingLabelPayload,
} from '@/lib/print/printReceivingLabel';
import { getProfileForRole, printRawToProfile, resolvePaperSize } from '@/lib/print/browserPrint';
import {
  buildReceivingLabelBitmapCommands,
  buildReceivingLabelCommands,
} from '@/lib/print/labelCommands';
import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { isSilentPrintEnabled } from '@/lib/print/printMode';

const RECEIVING_LABEL_SIZE = resolvePaperSize('2x1');

// Re-exported so the unbox workspace (LineEditPanel / LabelEditPopover /
// useUnboxLineController) and the raw-command builder keep their existing import
// path. The canonical definition lives in `@/lib/print/printReceivingLabel`.
export type { ReceivingLabelPayload };
export { resolveReceivingQrValue as resolveReceivingLabelQrValue };

/**
 * Print the unbox/receiving carton label. Renders the SAME face as the
 * on-screen preview (via {@link receivingPayloadToFace} → {@link buildLabelHtml})
 * and drives the browser-only print pipeline: WebUSB/Web Serial raw
 * TSPL/ZPL to the paired thermal printer, then browser iframe dialog fallback.
 */
export function printReceivingLabel(payload: ReceivingLabelPayload) {
  if (typeof window === 'undefined') return;
  const face = receivingPayloadToFace(payload);
  if (!face.matrix.value) return;

  // quietZone defaults to a scanner-safe margin in the print shell (this is the
  // real printed symbol, not the edge-to-edge preview).
  const html = buildLabelHtml({
    name: 'Label',
    ...buildFaceInfoHtml(face),
    dataMatrix: face.matrix,
    hri: face.hri,
  });

  // Silent printing OFF (Settings → Hardware) skips every dialog-free path and
  // hands the label to the browser's print dialog so an operator can pick a
  // printer / preview.
  const silent = isSilentPrintEnabled();

  void (async () => {
    if (silent) {
      // Browser-native raw (WebUSB / Web Serial) to the paired label printer.
      //    Sends raw TSPL/ZPL/ESC-POS so the firmware renders the label — no OS
      //    print dialog. Skipped for `os` profiles (those use the dialog path).
      const labelProfile = getProfileForRole('label');
      if (labelProfile && labelProfile.kind !== 'os') {
        const commands =
          labelProfile.language === 'tspl'
            ? buildReceivingLabelBitmapCommands(
                payload,
                RECEIVING_LABEL_SIZE,
                labelProfile.copies,
              )
            : buildReceivingLabelCommands(
                payload,
                labelProfile.language,
                RECEIVING_LABEL_SIZE,
                labelProfile.copies,
              );
        const res = await printRawToProfile(commands, labelProfile);
        if (res.success) return; // silent print to the paired thermal printer
        // Raw send failed — fall through to the iframe/window.print() path below.
        // We do NOT toast "failed": window.print() is fire-and-forget, so the
        // label may well print on the fallback and a failure toast would be a
        // false alarm. Diagnostics live in Settings → Hardware "Test".
        console.warn('printReceivingLabel: browser raw print failed, falling back:', res.reason);
      }
    }
    // Dialog path — hidden iframe + the page's own window.print(). Silent
    //    only under `--kiosk-printing` (default printer); otherwise the normal
    //    print dialog. An iframe (vs a popup) never flashes and dodges the
    //    popup blocker.
    printHtmlInIframe(html, { name: 'Receiving label' });
  })();
}

/**
 * Record that a receiving label was printed for a line — the single choke point
 * shared by the default unbox print and the custom label-editor print, so the
 * two can never diverge.
 *
 * Three effects, in order of latency:
 *   1. localStorage marker + `receiving-label-printed` DOM event → the Print
 *      step / row chips flip *instantly* on this device (optimistic).
 *   2. POST /api/receiving/lines/[id]/label-printed → the DURABLE stamp
 *      (`receiving_line_testing.label_printed_at`) that survives refresh / other
 *      devices and is auditable. Fire-and-forget; the server COALESCE keeps the
 *      first print, so a reprint is a no-op on the recorded value.
 */
export function markReceivingLabelPrinted(lineId: number): void {
  if (typeof window === 'undefined' || !(lineId > 0)) return;
  try {
    window.localStorage.setItem(`receiving-label-printed:${lineId}`, String(Date.now()));
  } catch {
    /* private-mode / quota — non-fatal */
  }
  window.dispatchEvent(
    new CustomEvent('receiving-label-printed', { detail: { line_id: lineId } }),
  );
  void fetch(`/api/receiving/lines/${lineId}/label-printed`, { method: 'POST' }).catch(() => {});
}

/**
 * Record the no-serial waiver for a receiving line — the single choke point for
 * the green-check "no serial" toggle (NoSerialControl), so every caller persists
 * the SAME durable fact and the stepper can never disagree with the control.
 *
 * Two effects, in order of latency (mirrors {@link markReceivingLabelPrinted}):
 *   1. `dispatchLineUpdated` → the shared `receiving-line-updated` bus patches
 *      `selectedLine.serial_absent`, so the Unbox stepper's Serial step (which
 *      derives from `row.serial_absent`) flips the instant the operator toggles —
 *      the SAME optimistic path a scanned serial already rides.
 *   2. POST /api/receiving/lines/[id]/serial-absent → the DURABLE stamp
 *      (`receiving_line_testing.serial_absent`) that survives refresh / another
 *      device. Fire-and-forget; a toggle writes the exact value (set or clear).
 *
 * A stub/unfound line (id ≤ 0) is skipped — there's no persisted line to stamp
 * yet; the local controller state still reflects the waiver until the line lands.
 */
export function markReceivingSerialAbsent(
  lineId: number,
  { absent, reason }: { absent: boolean; reason: string | null },
): void {
  if (typeof window === 'undefined' || !(lineId > 0)) return;
  dispatchLineUpdated({
    id: lineId,
    serial_absent: absent,
    serial_absent_reason: reason,
  });
  void fetch(`/api/receiving/lines/${lineId}/serial-absent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ absent, reason }),
  }).catch(() => {});
}
