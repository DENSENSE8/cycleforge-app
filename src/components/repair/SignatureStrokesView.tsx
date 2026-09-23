'use client';

/**
 * A stored signature, drawn from its STROKES.
 *
 * Callers: `KioskHistoryDetail` (drop-off + pick-up signatures).
 * Affected API: none. Data schemas: `documents.document_data.signatureStrokes`
 * (`SignatureStrokeGroup[]`, the shape `signature_pad` emits).
 * User: "I need to see both signatures."
 *
 * ## Why this exists beside the PNG
 *
 * `submit-repair-intake.ts` uploads a PNG to Blob and records the strokes in
 * the same `documents` row, and it says why: the Blob upload can fail while
 * the signature is perfectly good ("Signature image upload failed — stroke
 * data saved as backup"). So a face that renders only `signature_url` shows
 * an empty box for a device that WAS signed — the worst possible answer at a
 * counter, because it looks like the customer never signed.
 *
 * This is the documented fallback, not a second renderer of the same thing:
 * the PNG is preferred wherever it exists (see the caller), and this draws the
 * vector the pad captured when it does not.
 *
 * Read-only by construction — no canvas, no pointer handlers, no export.
 * Capture is `SignaturePad`; this only replays.
 */

import type { SignatureStrokeGroup } from '@/lib/repair/signature-geometry';

/** Normalize unknown jsonb into stroke groups. Anything else renders nothing. */
export function parseSignatureStrokes(raw: unknown): SignatureStrokeGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: SignatureStrokeGroup[] = [];
  for (const group of raw) {
    if (!group || typeof group !== 'object') continue;
    const points = (group as { points?: unknown }).points;
    if (!Array.isArray(points)) continue;
    const parsed = points.filter(
      (p): p is { x: number; y: number } =>
        !!p &&
        typeof p === 'object' &&
        Number.isFinite((p as { x?: unknown }).x) &&
        Number.isFinite((p as { y?: unknown }).y),
    );
    if (parsed.length > 0) groups.push({ points: parsed });
  }
  return groups;
}

interface StrokeBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** The ink's own bounds, padded for the stroke cap. Null when there is no ink. */
function strokeBox(groups: readonly SignatureStrokeGroup[]): StrokeBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const group of groups) {
    for (const point of group.points) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const pad = 4;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };
}

export function SignatureStrokesView({
  strokes,
  label,
  className,
}: {
  /** Raw `document_data.signatureStrokes`, straight off the row. */
  strokes: unknown;
  label: string;
  className?: string;
}) {
  const groups = parseSignatureStrokes(strokes);
  const box = strokeBox(groups);
  if (!box) return null;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${box.minX} ${box.minY} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      data-testid="kiosk-signature-strokes"
    >
      {groups.map((group, index) => (
        <polyline
          key={index}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={group.points.map((p) => `${p.x},${p.y}`).join(' ')}
        />
      ))}
    </svg>
  );
}
