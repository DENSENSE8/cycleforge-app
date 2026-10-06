import { escapeLabelHtml } from '@/lib/print/labelHtml';

/** One model for the printed 2×1" label *face*, shared by every label in the app — receiving/PO cartons, testing/unit stickers,… */
export interface LabelFaceModel {
  /** Layout family. */
  kind?: 'receiving' | 'product' | 'location' | 'lpn' | 'rack';
  /** Top-left (receiving: platform/type). For `product`, holds the full-top-row title. */
  topLeft: string;
  /** Top-right — date (receiving). Unused by `product`. */
  topRight: string;
  /** Center — the 3-line hero text (receiving notes); for `product`, the one-line custom text under the title (hidden when empty). */
  center: string;
  /** Bottom-left — condition grade (`label` variant). */
  bottomLeft: string;
  /** Bottom-right — corner value: PO/ticket/tracking (receiving) or color (product). */
  bottomRight: string;
  matrix: { value: string; symbology: 'gs1datamatrix' | 'datamatrix'; scale?: number };
  /** Optional human-readable handle printed under the matrix (e.g. `R-1234`). */
  hri?: string;
}

/** Physical 2×1 face geometry shared by HTML and silent thermal rendering. */
export const LABEL_FACE_SHELL = {
  widthIn: 2,
  heightIn: 1,
  paddingXCssPx: 5,
  paddingYCssPx: 4,
  gapCssPx: 4,
  matrixSizeIn: 0.86,
} as const;

/** LPN typography shared by HTML and silent thermal rendering. */
export const LPN_LABEL_FACE_LAYOUT = {
  kickerFontCssPx: 10,
  codeFontCssPx: 30,
} as const;

/**
 * CSS for the face's info column. Class names are slot-neutral (tl/tr/center/
 * bl/br) so the same stylesheet serves carton and unit labels. Mirrors the
 * weights/sizes the receiving label has used since it was the only label face.
 */
// All slots share one font size (9px) and pure black so the face reads uniformly on the tiny 2×1" label without clipping; center notes…
const LABEL_FACE_CSS =
  '.row{display:flex;justify-content:space-between;align-items:baseline;gap:4px;line-height:1;width:100%}' +
  '.tl{flex:1 1 auto;min-width:0;font-size:9px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.tr{flex:0 0 auto;font-size:9px;font-weight:700;color:#000;white-space:nowrap;font-variant-numeric:tabular-nums}' +
  '.center{flex:1 1 auto;min-height:0;width:100%;font-size:9px;font-weight:600;color:#000;text-align:center;line-height:1.12;overflow:hidden;padding:0 1px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow-wrap:anywhere;word-break:break-word;align-self:stretch}' +
  // Product label title — fills a full top row, wraps up to 2 lines.
  '.ptitle{font-size:9px;font-weight:700;line-height:1.15;color:#000;text-align:left;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere;word-break:break-word}' +
  '.bl{flex:1 1 auto;min-width:0;font-size:9px;font-weight:900;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.br{flex:0 0 auto;font-size:9px;font-weight:900;letter-spacing:0.3px;line-height:1.05;color:#000;white-space:nowrap;font-variant-numeric:tabular-nums}';

/** Product face centre: one left-aligned line under the title; gone when empty so the default face is unchanged. */
const PRODUCT_LABEL_FACE_CSS =
  '.ptitle~.center{flex:0 1 auto;text-align:left;-webkit-line-clamp:1;padding:0}' +
  '.ptitle~.center:empty{display:none}';

/** Location sticker — large code, no room / zone / level gloss. */
const LOCATION_LABEL_FACE_CSS =
  '.lcode{flex:1 1 auto;width:100%;min-width:0;font-size:16px;font-weight:800;font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:-0.04em;line-height:1.05;color:#000;overflow-wrap:anywhere;word-break:break-word;display:flex;align-items:center}';

/**
 * Movable-rack sticker (rack placard, shelf, position) — words, never a room.
 * `.rkick` is the parent line (`RACK 12` on a shelf, `RACK 12 · SHELF 3` on a
 * position); the headline is the sticker's own level (`SHELF 3`). A placard
 * has no parent line, so its `RACK 12` headline steps up to placard size.
 */
const RACK_LABEL_FACE_CSS =
  '.rkick{flex:0 0 auto;width:100%;font-size:10px;font-weight:800;letter-spacing:0.3px;line-height:1.1;color:#000;overflow-wrap:anywhere}' +
  '.rkick:empty{display:none}' +
  '.rhead{flex:1 1 auto;min-height:0;width:100%;font-size:20px;font-weight:900;line-height:1.05;color:#000;font-variant-numeric:tabular-nums;display:flex;align-items:center}' +
  '.rkick:empty+.rhead{font-size:24px}';

/**
 * Handling-unit (box / tote) licence plate.
 * Operator ruling 2026-09-15: kicker top-left, ID left-middle, NO date. The
 */
const LPN_LABEL_FACE_CSS =
  `.hu-kicker{flex:0 0 auto;font-size:${LPN_LABEL_FACE_LAYOUT.kickerFontCssPx}px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7280;text-align:left;line-height:1}` +
  // The info column shares a 2in face with the 0.86in DataMatrix. 30px keeps
  // `H-100` (the first three-digit house plate) entirely on the paper instead
  // of relying on an ellipsis to conceal a clipped identity.
  `.hu-code{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:flex-start;font-size:${LPN_LABEL_FACE_LAYOUT.codeFontCssPx}px;font-weight:900;letter-spacing:0.5px;line-height:1;color:#111;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;

/** Build the info-column HTML + CSS for a label face. */
export function buildFaceInfoHtml(model: LabelFaceModel): {
  infoHtml: string;
  infoCss: string;
  infoAlign: 'space-between' | 'center';
} {
  if (model.kind === 'location') {
    return {
      infoHtml:
        `<div class="lcode">${escapeLabelHtml(model.center)}</div>`,
      infoCss: LABEL_FACE_CSS + LOCATION_LABEL_FACE_CSS,
      infoAlign: 'center',
    };
  }
  if (model.kind === 'rack') {
    // `topLeft` parent line, `center` headline.
    return {
      infoHtml:
        `<div class="rkick">${escapeLabelHtml(model.topLeft)}</div>` +
        `<div class="rhead">${escapeLabelHtml(model.center)}</div>`,
      infoCss: LABEL_FACE_CSS + LOCATION_LABEL_FACE_CSS + RACK_LABEL_FACE_CSS,
      infoAlign: 'center',
    };
  }
  if (model.kind === 'lpn') {
    // `topLeft` is the kicker, `center` the code. Every other slot is ignored
    // on this face by design — see LPN_LABEL_FACE_CSS.
    const infoHtml =
      `<div class="hu-kicker">${escapeLabelHtml(model.topLeft)}</div>` +
      `<div class="hu-code">${escapeLabelHtml(model.center)}</div>`;
    return { infoHtml, infoCss: LPN_LABEL_FACE_CSS, infoAlign: 'space-between' };
  }
  if (model.kind === 'product') {
    const infoHtml =
      `<div class="ptitle">${escapeLabelHtml(model.topLeft)}</div>` +
      `<div class="center">${escapeLabelHtml(model.center)}</div>` +
      `<div class="row"><span class="bl">${escapeLabelHtml(model.bottomLeft)}</span>` +
      `<span class="br">${escapeLabelHtml(model.bottomRight)}</span></div>`;
    return { infoHtml, infoCss: LABEL_FACE_CSS + PRODUCT_LABEL_FACE_CSS, infoAlign: 'space-between' };
  }
  const infoHtml =
    `<div class="row"><span class="tl">${escapeLabelHtml(model.topLeft)}</span>` +
    `<span class="tr">${escapeLabelHtml(model.topRight)}</span></div>` +
    `<div class="center">${escapeLabelHtml(model.center)}</div>` +
    `<div class="row"><span class="bl">${escapeLabelHtml(model.bottomLeft)}</span>` +
    `<span class="br">${escapeLabelHtml(model.bottomRight)}</span></div>`;
  return { infoHtml, infoCss: LABEL_FACE_CSS, infoAlign: 'space-between' };
}

/** Mutate an already-mounted label document's text slots in place. */
export function patchLabelFaceDocument(
  doc: {
    querySelector(selectors: string): {
      textContent: string | null;
      remove(): void;
      appendChild(node: { className: string; textContent: string }): unknown;
    } | null;
    createElement(tagName: string): { className: string; textContent: string };
  },
  model: LabelFaceModel,
): void {
  const setText = (sel: string, text: string) => {
    const el = doc.querySelector(sel);
    if (el) el.textContent = text;
  };

  if (model.kind === 'location') {
    setText('.lcode', model.center);
  } else if (model.kind === 'rack') {
    setText('.rkick', model.topLeft);
    setText('.rhead', model.center);
  } else if (model.kind === 'lpn') {
    setText('.hu-kicker', model.topLeft);
    setText('.hu-code', model.center);
  } else if (model.kind === 'product') {
    setText('.ptitle', model.topLeft);
    setText('.center', model.center);
    setText('.bl', model.bottomLeft);
    setText('.br', model.bottomRight);
  } else {
    setText('.tl', model.topLeft);
    setText('.tr', model.topRight);
    setText('.center', model.center);
    setText('.bl', model.bottomLeft);
    setText('.br', model.bottomRight);
  }

  const hri = (model.hri ?? '').trim();
  const hriEl = doc.querySelector('.hri');
  if (hriEl) {
    if (hri) hriEl.textContent = hri;
    else hriEl.remove();
    return;
  }
  if (!hri) return;
  const qrcol = doc.querySelector('.qrcol');
  if (!qrcol) return;
  const next = doc.createElement('div');
  next.className = 'hri';
  next.textContent = hri;
  qrcol.appendChild(next);
}
