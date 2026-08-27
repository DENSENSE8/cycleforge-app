'use client';

/**
 * General-purpose DataMatrix renderer used by every printed label in the
 * app — locations, racks, unit/serial product labels, receiving cartons,
 * receiving lines, repair tickets. Two symbology modes:
 *
 *   • `gs1datamatrix` — payload is GS1 AI string in parens form
 *                       (e.g. `(414){gln}(254){code}`, `(01){gtin}(21){serial}`).
 *                       bwip-js inserts the FNC1 control character on the
 *                       wire so industrial scanners decode the AIs natively.
 *
 *   • `datamatrix`    — plain DataMatrix carrying an arbitrary string: either
 *                       an absolute platform Digital Link
 *                       (`https://{slug}.app.cycleforge.ai/m/r/1234`) or a
 *                       bare internal handle (`R-1234`, `L-567`, `REP-89`)
 *                       where the path has no anonymous landing.
 *
 * **A printed symbol is no longer necessarily opaque to a phone.** This
 * comment used to claim "no clickable URL, no backend hostname" — true only
 * while every payload was a bare handle. Since 2026-08-01 carton and unit
 * labels encode an absolute URL on the tenant's own platform host, which a
 * camera opens directly; that URL is dual-audience by design (staff → ops,
 * anon → the tenant's branded interstitial). What is still never printed is a
 * raw backend/IaaS hostname. Which kinds mint a URL vs. stay bare is decided
 * in exactly one place — `encodePrintMatrix` (`@/lib/qr/platform-link`).
 *
 * The internal scanner (`/m/scan` + `routeScan()`) ignores the host either
 * way and resolves the path or the handle locally.
 *
 * The bwip-js encoder (~250 KB gz) loads lazily on first render — statically
 * importing it here put the whole engine in every station bundle's critical
 * path. The symbol's box is reserved up front (fixed `size`, or 100% when
 * `fill`), so the async encode never shifts layout.
 */

import { useEffect, useState } from 'react';
import type { DataMatrixSymbology } from '@/lib/barcode/dataMatrixSvg';

type Gs1DataMatrixSymbology = DataMatrixSymbology;

interface Gs1DataMatrixBaseProps {
  /** Payload to encode. AI parens form for `gs1datamatrix`, plain text for `datamatrix`. */
  value: string;
  /** Symbology — defaults to `gs1datamatrix` (the common case). */
  symbology?: Gs1DataMatrixSymbology;
  /** Foreground colour. Defaults to pure black for thermal print contrast. */
  fgColor?: string;
  /** Background colour. Defaults to white. */
  bgColor?: string;
  /** ARIA label for screen readers. */
  ariaLabel?: string;
  /**
   * Quiet-zone border in *modules*. Defaults to 2 (scanner-safe). Pass 0 for
   * on-screen previews so the ink fills the box edge-to-edge and adjacent text
   * lines up with the visible matrix edges.
   */
  quietZone?: number;
}

type Gs1DataMatrixProps =
  | (Gs1DataMatrixBaseProps & {
      /** Side length in CSS pixels (DataMatrix is always square). */
      size: number;
      fill?: false;
    })
  | (Gs1DataMatrixBaseProps & {
      /**
       * Stretch to the parent box (`width/height: 100%`). Parent must supply a
       * square sizing context.
       */
      fill: true;
      size?: never;
    });

export function Gs1DataMatrix({
  value,
  size,
  fill = false,
  symbology = 'gs1datamatrix',
  fgColor = '#000000',
  bgColor = '#FFFFFF',
  ariaLabel,
  quietZone,
}: Gs1DataMatrixProps) {
  // null = still encoding (box reserved, empty) · '' = failed · string = SVG.
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const boxStyle = fill
    ? { width: '100%' as const, height: '100%' as const, lineHeight: 0 as const }
    : { width: size as number, height: size as number, lineHeight: 0 as const };

  useEffect(() => {
    let cancelled = false;
    setSvgMarkup(null);
    import('@/lib/barcode/dataMatrixSvg')
      .then(({ renderDataMatrixSvg }) => {
        if (cancelled) return;
        try {
          setSvgMarkup(
            renderDataMatrixSvg({
              value,
              symbology,
              barcolor: fgColor.replace('#', ''),
              backgroundcolor: bgColor.replace('#', ''),
              quietZone,
            }),
          );
        } catch (err) {
          console.error('[Gs1DataMatrix] failed to render', err);
          setSvgMarkup('');
        }
      })
      .catch((err) => {
        console.error('[Gs1DataMatrix] failed to load encoder', err);
        if (!cancelled) setSvgMarkup('');
      });
    return () => {
      cancelled = true;
    };
  }, [value, symbology, fgColor, bgColor, quietZone]);

  const label =
    ariaLabel ??
    (symbology === 'gs1datamatrix' ? 'GS1 DataMatrix barcode' : 'DataMatrix barcode');

  if (svgMarkup === null) {
    // Encoder still loading — hold the square so the fill never shifts layout.
    return <div aria-hidden style={{ ...boxStyle, background: bgColor }} />;
  }

  if (svgMarkup === '') {
    return (
      <div
        role="img"
        aria-label="Barcode render failed"
        style={{
          ...boxStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fef2f2',
          color: '#991b1b',
          fontSize: 10,
          fontWeight: 600,
          textAlign: 'center',
          padding: 4,
          boxSizing: 'border-box',
        }}
      >
        Barcode failed
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      style={boxStyle}
      // bwip-js returns trusted, machine-generated SVG. Safe to inject.
      dangerouslySetInnerHTML={{
        __html: svgMarkup.replace(
          /<svg([^>]*)>/,
          `<svg$1 width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`,
        ),
      }}
    />
  );
}
