/**
 * Shared clamp for 2×1 bulk print. Kept dependency-free so routing can own
 * `?count=` without pulling the barcode engine.
 */

export const MAX_LABEL_COPIES = 99;

export function clampLabelCopies(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_LABEL_COPIES, Math.trunc(n)));
}

/** Wire token for `?count=` — digits 1..99, no leading zeros. */
export function parseLabelCopiesWire(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (n < 1 || n > MAX_LABEL_COPIES) return null;
  return trimmed;
}

export function parseLabelCopies(raw: string | null | undefined): number {
  if (!raw) return 1;
  const wire = parseLabelCopiesWire(raw);
  return wire ? Number.parseInt(wire, 10) : 1;
}
