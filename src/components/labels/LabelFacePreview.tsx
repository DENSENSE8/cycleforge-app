'use client';

/**
 * On-screen render of a printed 2×1" label face from a {@link LabelFaceModel}.
 *
 * Renders the SAME HTML document Chrome prints ({@link buildLabelHtml} with
 * `preview: true`) inside a scaled iframe — so the Unbox / Testing / Products
 * preview cannot drift from the physical sticker. `embedded` strips the
 * bordered card chrome for use inside a menu/popover.
 *
 * The iframe is always black-on-white paper (print-faithful). Host width is
 * measured and the 2in×1in document is scaled up to at most 2.5× (~480×240)
 * so it stays readable without overflowing narrow popovers.
 *
 * Text-slot updates (center note, corners, HRI) patch the live iframe DOM via
 * {@link patchLabelFaceDocument} — rewriting `srcDoc` on every keystroke would
 * tear down the document and flash the sticker. Full rebuild only when matrix /
 * symbology / scale / kind identity changes.
 */

import { useEffect, useRef, useState } from 'react';
import {
  buildFaceInfoHtml,
  patchLabelFaceDocument,
  type LabelFaceModel,
} from '@/lib/print/labelFace';

/** CSS px per CSS inch (browser convention). */
const CSS_PX_PER_IN = 96;
/** Intrinsic label width in inches (matches print shell default). */
const LABEL_WIDTH_IN = 2;
/** Intrinsic label height in inches. */
const LABEL_HEIGHT_IN = 1;
/** Cap so the sticker stays readable but not giant on a wide card. */
const MAX_SCALE = 2.5;

export function LabelFacePreview({
  model,
  embedded,
}: {
  model: LabelFaceModel;
  embedded?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [html, setHtml] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  const matrixValue = model.matrix.value?.trim() ?? '';

  // Full print-shell rebuild — matrix / kind identity only. Text slots patch
  // in place below so dock typing does not flash the iframe.
  useEffect(() => {
    if (!matrixValue) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    const faceHtml = buildFaceInfoHtml(modelRef.current);
    void import('@/lib/print/printLabel')
      .then(({ buildLabelHtml }) => {
        if (cancelled) return;
        setHtml(
          buildLabelHtml({
            name: 'Label',
            ...faceHtml,
            dataMatrix: modelRef.current.matrix,
            hri: modelRef.current.hri,
            preview: true,
          }),
        );
      })
      .catch((err) => {
        console.error('[LabelFacePreview] failed to load print shell', err);
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matrixValue, model.matrix.symbology, model.matrix.scale, model.kind]);

  // Patch face text slots without touching srcDoc.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;

    const apply = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      patchLabelFaceDocument(doc, modelRef.current);
    };

    iframe.addEventListener('load', apply);
    apply();
    return () => iframe.removeEventListener('load', apply);
  }, [
    html,
    model.hri,
    model.topLeft,
    model.topRight,
    model.center,
    model.bottomLeft,
    model.bottomRight,
    model.kind,
  ]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      const widthPx = el.clientWidth;
      if (widthPx <= 0) return;
      const fit = widthPx / (LABEL_WIDTH_IN * CSS_PX_PER_IN);
      setScale(Math.min(MAX_SCALE, Math.max(0.5, fit)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!matrixValue) return null;

  const shell = embedded
    ? 'w-full bg-transparent'
    : 'w-full rounded-lg border border-border-soft/80 bg-surface-card px-3 py-3 shadow-sm';

  const scaledW = LABEL_WIDTH_IN * CSS_PX_PER_IN * scale;
  const scaledH = LABEL_HEIGHT_IN * CSS_PX_PER_IN * scale;

  return (
    <div className={shell}>
      <div ref={hostRef} className="w-full">
        <div
          className="relative mx-auto overflow-hidden bg-white shadow-sm ring-1 ring-border-soft/60"
          style={{ width: scaledW, height: scaledH, maxWidth: '100%' }}
        >
          {html ? (
            <iframe
              ref={iframeRef}
              title="Label preview"
              srcDoc={html}
              sandbox="allow-same-origin"
              tabIndex={-1}
              // Sub-pixel overflow inside the 2×1in doc used to paint iframe
              // scrollbars; transform:scale then blew them up to "big" chrome.
              scrolling="no"
              className="pointer-events-none absolute left-0 top-0 overflow-hidden border-0"
              style={{
                width: `${LABEL_WIDTH_IN}in`,
                height: `${LABEL_HEIGHT_IN}in`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                overflow: 'hidden',
              }}
            />
          ) : (
            <div
              className="h-full w-full animate-pulse bg-surface-strong"
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>
  );
}
