import { escapeLabelHtml } from '@/lib/print/labelHtml';

/**
 * One model for the printed 2×1" label *face*, shared by every label in the
 * app — receiving/PO cartons, testing/unit stickers, local-pickup, etc.
 *
 * The face is a fixed 5-slot grid plus a DataMatrix:
 *
 *   topLeft ───────────── topRight   ┌──────────┐
 *        (center, 3-line)            │  Data    │
 *   bottomLeft ───────── bottomRight  │  Matrix  │
 *                                     └──────────┘
 *
 * Both the on-screen preview ({@link LabelFacePreview} — a scaled iframe of
 * {@link buildLabelHtml}) and the printed HTML ({@link buildFaceInfoHtml} →
 * the shared {@link buildLabelHtml}/`printLabel` shell) consume this model, so
 * what techs see is exactly what prints — there's no second hand-built layout
 * to drift. Domain adapters (`receivingPayloadToFace`, `unitLabelToFace`) map
 * their payloads into it.
 */
export interface LabelFaceModel {
  /**
   * Layout family. `receiving` (default) = the 4-corner carton face
   * (platform·date / notes / condition·corner). `product` = the unit/testing
   * face where the product title fills a full top row, with condition·color on
   * the bottom row and no center band. `location` = coordinate-only inventory
   * sticker: large alphanumeric code, no room name / zone kicker / level gloss.
   */
  kind?: 'receiving' | 'product' | 'location';
  /** Top-left (receiving: platform/type). For `product`, holds the full-top-row title. */
  topLeft: string;
  /** Top-right — date (receiving). Unused by `product`. */
  topRight: string;
  /** Center — the 3-line hero text (receiving notes). Unused by `product`. */
  center: string;
  /** Bottom-left — condition grade (`label` variant). */
  bottomLeft: string;
  /** Bottom-right — corner value: PO/ticket/tracking (receiving) or color (product). */
  bottomRight: string;
  matrix: { value: string; symbology: 'gs1datamatrix' | 'datamatrix'; scale?: number };
  /** Optional human-readable handle printed under the matrix (e.g. `R-1234`). */
  hri?: string;
}

/**
 * CSS for the face's info column. Class names are slot-neutral (tl/tr/center/
 * bl/br) so the same stylesheet serves carton and unit labels. Mirrors the
 * weights/sizes the receiving label has used since it was the only label face.
 */
// All slots share one font size (9px) and pure black so the face reads uniformly
// on the tiny 2×1" label without clipping; center notes stay 9px too. On-screen
// preview scales this same CSS via a print-HTML iframe — no second type scale.
// `.row` is width:100% so space-between actually pins left/right weight across
// the info column (shrink-wrapped rows collapse to the left and leave a dead
// gap before the matrix).
export const LABEL_FACE_CSS =
  '.row{display:flex;justify-content:space-between;align-items:baseline;gap:4px;line-height:1;width:100%}' +
  '.tl{flex:1 1 auto;min-width:0;font-size:9px;font-weight:700;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.tr{flex:0 0 auto;font-size:9px;font-weight:700;color:#000;white-space:nowrap;font-variant-numeric:tabular-nums}' +
  '.center{flex:1 1 auto;min-height:0;width:100%;font-size:9px;font-weight:600;color:#000;text-align:center;line-height:1.12;overflow:hidden;padding:0 1px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow-wrap:anywhere;word-break:break-word;align-self:stretch}' +
  // Product label title — fills a full top row, wraps up to 2 lines.
  '.ptitle{font-size:9px;font-weight:700;line-height:1.15;color:#000;text-align:left;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere;word-break:break-word}' +
  '.bl{flex:1 1 auto;min-width:0;font-size:9px;font-weight:900;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.br{flex:0 0 auto;font-size:9px;font-weight:900;letter-spacing:0.3px;line-height:1.05;color:#000;white-space:nowrap;font-variant-numeric:tabular-nums}';

/** Coordinate-only location sticker — large code, no room / zone / level gloss. */
export const LOCATION_LABEL_FACE_CSS =
  '.lcode{flex:1 1 auto;width:100%;min-width:0;font-size:16px;font-weight:800;font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:-0.04em;line-height:1.05;color:#000;overflow-wrap:anywhere;word-break:break-word;display:flex;align-items:center}';

/**
 * Build the info-column HTML + CSS for a label face. Feed the result straight
 * into the shared `printLabel`/`buildLabelHtml` shell along with `model.matrix`
 * and `model.hri`. Branches on `model.kind`: `location` is a single large code;
 * `product` puts the title in a full top row with condition·color beneath;
 * `receiving` keeps the 4-corner grid.
 */
export function buildFaceInfoHtml(model: LabelFaceModel): {
  infoHtml: string;
  infoCss: string;
  infoAlign: 'space-between' | 'center';
} {
  if (model.kind === 'location') {
    return {
      infoHtml: `<div class="lcode">${escapeLabelHtml(model.center)}</div>`,
      infoCss: LABEL_FACE_CSS + LOCATION_LABEL_FACE_CSS,
      infoAlign: 'center',
    };
  }
  if (model.kind === 'product') {
    const infoHtml =
      `<div class="ptitle">${escapeLabelHtml(model.topLeft)}</div>` +
      `<div class="row"><span class="bl">${escapeLabelHtml(model.bottomLeft)}</span>` +
      `<span class="br">${escapeLabelHtml(model.bottomRight)}</span></div>`;
    return { infoHtml, infoCss: LABEL_FACE_CSS, infoAlign: 'space-between' };
  }
  const infoHtml =
    `<div class="row"><span class="tl">${escapeLabelHtml(model.topLeft)}</span>` +
    `<span class="tr">${escapeLabelHtml(model.topRight)}</span></div>` +
    `<div class="center">${escapeLabelHtml(model.center)}</div>` +
    `<div class="row"><span class="bl">${escapeLabelHtml(model.bottomLeft)}</span>` +
    `<span class="br">${escapeLabelHtml(model.bottomRight)}</span></div>`;
  return { infoHtml, infoCss: LABEL_FACE_CSS, infoAlign: 'space-between' };
}

/**
 * Mutate an already-mounted label document's text slots in place.
 *
 * Used by {@link LabelFacePreview} so typing the center (or any face string)
 * does not rewrite iframe `srcDoc` — that would tear down the document and
 * flash the sticker. Matrix / kind identity still requires a full rebuild.
 *
 * Sets `textContent` (not `innerHTML`) so caller strings need no escaping.
 */
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
  } else if (model.kind === 'product') {
    setText('.ptitle', model.topLeft);
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
