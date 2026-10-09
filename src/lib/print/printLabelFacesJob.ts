/** Batched 2×1" print for a RUN OF PLATES — the channel every bulk label run shares. */

import { expandPlateRun } from '@/lib/print/labelCopies';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';

type LabelFacesJobChannel = 'usb' | 'iframe' | 'skipped';

/** USB sequential only — the iframe batch prints as one job and cannot tick. */
type LabelFacesJobProgress = (done: number, total: number) => void;

/** Map a face onto the shared `printLabel` shell's options. */
function faceToPrintOpts(face: LabelFaceModel, name?: string) {
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
   * Identical stickers of EACH face (the tote Copies field).
   * Expanded into extra PLATES in this run — one awaited job per sticker on
   * USB, one page per sticker on the iframe. Never a printer repeat count.
   */
  copies?: number;
  onProgress?: LabelFacesJobProgress;
  /**
   * USB sequential only: awaited before each sticker; `false` stops the run
   * there (it still returns `'usb'` — the caller that cancelled knows).
   */
  checkpoint?: () => Promise<boolean>;
}): Promise<LabelFacesJobChannel> {
  if (typeof window === 'undefined') return 'skipped';
  const { faces } = input;
  const nameFor = (face: LabelFaceModel) => input.faceName?.(face) ?? input.name;
  // An empty run and a face with no symbol both print nothing: a blank 2×1 is
  // worse than no label, because it looks like stock that jammed.
  if (faces.length === 0 || !faces.every((f) => f.matrix.value.trim())) return 'skipped';
  // Copies become paper here, once, for every family and both channels.
  const plates = expandPlateRun(faces, input.copies);

  // Deliberately dynamic, not static:
  const { printLabelJob, buildMultiPageLabelHtml } = await import('@/lib/print/printLabel');
  const { reserveLegacyPrintPopup, printHtmlInIframe } = await import('@/lib/print/iframePrint');

  if (plates.length === 1) {
    return printLabelJob({
      ...faceToPrintOpts(plates[0]!, nameFor(plates[0]!)),
      legacyPopup: reserveLegacyPrintPopup(),
    });
  }

  const { silentRawLabelProfile } = await import('@/lib/print/browserPrint');
  if (silentRawLabelProfile()) {
    const total = plates.length;
    input.onProgress?.(0, total);
    let usb = 0;
    for (const plate of plates) {
      if (input.checkpoint && !(await input.checkpoint())) return 'usb';
      const result = await printLabelJob(faceToPrintOpts(plate, nameFor(plate)));
      if (result !== 'usb') break;
      usb += 1;
      input.onProgress?.(usb, total);
    }
    if (usb === total) return 'usb';
  }

  const html = buildMultiPageLabelHtml(plates.map((plate) => faceToPrintOpts(plate, nameFor(plate))));
  printHtmlInIframe(html, {
    name: input.name,
    legacyPopup: reserveLegacyPrintPopup(),
  });
  return 'iframe';
}
