/** Shared bwip-js wrapper that returns a DataMatrix as an SVG string — usable from both React components (via `dangerouslySetInnerHTML`)… */

import bwipjs from 'bwip-js/browser';

export type DataMatrixSymbology = 'gs1datamatrix' | 'datamatrix';

export interface RenderDataMatrixOptions {
  /** Payload string. AI parens form for `gs1datamatrix`, plain for `datamatrix`. */
  value: string;
  /** Symbology — defaults to `gs1datamatrix`. */
  symbology?: DataMatrixSymbology;
  /** Pixels per module (dot resolution). Higher = larger but crisper print. */
  scale?: number;
  /** Foreground colour hex (no `#`). */
  barcolor?: string;
  /** Background colour hex (no `#`). */
  backgroundcolor?: string;
  /** Quiet-zone border in *modules* on every side. */
  quietZone?: number;
}

export function renderDataMatrixSvg(opts: RenderDataMatrixOptions): string {
  const pad = opts.quietZone ?? 2;
  const bg = opts.backgroundcolor ?? 'FFFFFF';
  // A transparent background lets the surface behind the symbol show through
  // (used by on-screen previews that recolour the code per theme). bwip-js draws
  // no background rect when `backgroundcolor` is omitted.
  const transparent = bg.toLowerCase() === 'transparent' || bg.toLowerCase() === 'none';
  return bwipjs.toSVG({
    bcid: opts.symbology ?? 'gs1datamatrix',
    text: opts.value,
    scale: opts.scale ?? 4,
    includetext: false,
    paddingwidth: pad,
    paddingheight: pad,
    rotate: 'N',
    barcolor: opts.barcolor ?? '000000',
    ...(transparent ? {} : { backgroundcolor: bg }),
  });
}
