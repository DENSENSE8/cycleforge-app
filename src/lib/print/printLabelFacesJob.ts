/**
 * Batched 2×1" print for N *distinct* faces — the channel every bulk label run
 * shares.
 *
 * This is the engine that used to live inside `printLocationLabelsJob`, lifted
 * out the day a second family (handling-unit totes) needed the same batching.
 * It is deliberately face-generic: it takes {@link LabelFaceModel}s, not
 * `LocationSegments`, so a tote run and a bin run cannot drift into two
 * different print pipelines.
 *
 * Two channels, in preference order:
 *
 *   1. **USB sequential** — when silent print is on and a raw (TSPL/ZPL/ESC-POS)
 *      label profile is paired. One `printLabelJob` per face, awaited, so the
 *      caller can tick `Printing 12/47`. Bails to the iframe on the first
 *      non-USB result rather than half-printing down two channels.
 *   2. **One multi-page iframe** — a single document with one page per face.
 *
 * Why one job and not a loop of `printLabel` calls: each popup print reserves a
 * window synchronously (`reserveLegacyPrintPopup`). Looping that over 40 totes
 * asks the browser for 40 popups and gets one, then a block. The batch reserves
 * exactly one.
 *
 * Identical copies of ONE face are a different axis — that is `copies` on
 * {@link printLabelJob} (TSPL `PRINT N,1` / ZPL `^PQN`), not N entries here.
 *
 * Callers: printLocationLabel (bin / rack), printLabelRun (tote runs).
 */

import { clampLabelCopies } from '@/lib/print/labelCopies';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';

export type LabelFacesJobChannel = 'usb' | 'iframe' | 'skipped';

/** USB sequential only — the iframe batch prints as one job and cannot tick. */
export type LabelFacesJobProgress = (done: number, total: number) => void;

/** Map a face onto the shared `printLabel` shell's options. */
export function faceToPrintOpts(face: LabelFaceModel, name?: string) {
  const { infoHtml, infoCss, infoAlign } = buildFaceInfoHtml(face);
  return {
    name,
    infoHtml,
    infoCss,
    infoAlign,
    dataMatrix: face.matrix,
    hri: face.hri,
    face,
  };
}

export async function printLabelFacesJob(input: {
  faces: readonly LabelFaceModel[];
  /** Batch name — popup-blocked log prefix, e.g. `Tote labels`. */
  name: string;
  /**
   * Per-sticker job name (the print dialog's document title, and the USB job
   * label). Defaults to the batch `name`. Distinct because an operator
   * cancelling one sticker wants to see `Tote H-412`, not `Tote labels`.
   */
  faceName?: (face: LabelFaceModel) => string;
  /**
   * Identical stickers of EACH face (tote Copies field).
   * USB uses TSPL `PRINT N,1`; the iframe repeats the page.
   */
  copies?: number;
  onProgress?: LabelFacesJobProgress;
}): Promise<LabelFacesJobChannel> {
  if (typeof window === 'undefined') return 'skipped';
  const { faces } = input;
  const copies = clampLabelCopies(input.copies);
  const nameFor = (face: LabelFaceModel) => input.faceName?.(face) ?? input.name;
  // An empty run and a face with no symbol both print nothing: a blank 2×1 is
  // worse than no label, because it looks like stock that jammed.
  if (faces.length === 0 || !faces.every((f) => f.matrix.value.trim())) return 'skipped';

  // Deliberately dynamic, not static: `printLabel` pulls in the bwip-js
  // barcode engine and `browserPrint` touches WebUSB / Web Serial. Both are
  // browser-only and heavy, and every page that merely *builds* a face would
  // otherwise pay for them at import time. Loaded on the actual print.
  const { printLabelJob, buildMultiPageLabelHtml } = await import('@/lib/print/printLabel');
  const { reserveLegacyPrintPopup, printHtmlInIframe } = await import('@/lib/print/iframePrint');
  const { isSilentPrintEnabled } = await import('@/lib/print/printMode');

  if (faces.length === 1) {
    return printLabelJob({
      ...faceToPrintOpts(faces[0]!, nameFor(faces[0]!)),
      copies,
      legacyPopup: reserveLegacyPrintPopup(),
    });
  }

  if (isSilentPrintEnabled()) {
    const { getProfileForRole } = await import('@/lib/print/browserPrint');
    const labelProfile = getProfileForRole('label');
    if (labelProfile && labelProfile.kind !== 'os' && labelProfile.language !== 'none') {
      const total = faces.length;
      input.onProgress?.(0, total);
      let usb = 0;
      for (const face of faces) {
        const result = await printLabelJob({
          ...faceToPrintOpts(face, nameFor(face)),
          copies,
        });
        if (result !== 'usb') break;
        usb += 1;
        input.onProgress?.(usb, total);
      }
      if (usb === faces.length) return 'usb';
    }
  }

  const pages = faces.flatMap((face) =>
    Array.from({ length: copies }, () => faceToPrintOpts(face, nameFor(face))),
  );
  const html = buildMultiPageLabelHtml(pages);
  printHtmlInIframe(html, {
    name: input.name,
    legacyPopup: reserveLegacyPrintPopup(),
  });
  return 'iframe';
}
