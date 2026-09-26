'use client';

/** General-purpose DataMatrix renderer used by every printed label in the app — locations, racks, unit/serial product labels, receiving… */

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
