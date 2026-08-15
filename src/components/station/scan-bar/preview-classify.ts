/**
 * Preview-card copy helpers. Classification itself stays in station hosts
 * (classifyUnboxScan / classifyTestingScan / getStationInputMode).
 */

export type PreviewTypeSource = 'auto' | 'forced';

export interface StationScanPreviewClassification {
  /** Operator-facing type: Ticket, Tracking, PO, Serial, Amz Prep, … */
  typeLabel: string;
  value: string;
  source: PreviewTypeSource;
  /** Auto-heuristic label when a type is armed (Forced vs Auto). */
  autoTypeLabel?: string;
}

export function formatPreviewLine(
  c: StationScanPreviewClassification,
): string {
  return `Would search ${c.typeLabel}: ${c.value}`;
}

/** `Forced {type}` when armed; `Auto → {type}` when the rail is Auto. */
export function formatPreviewSource(
  c: StationScanPreviewClassification,
): string {
  if (c.source === 'forced') return `Forced ${c.typeLabel}`;
  return `Auto → ${c.typeLabel}`;
}

export function classifyPreviewFromArmed<T extends string>(opts: {
  value: string;
  armedMode: T | null;
  autoMode: T;
  labels: Record<T, string>;
}): StationScanPreviewClassification | null {
  const value = opts.value.trim();
  if (!value) return null;
  const used = opts.armedMode ?? opts.autoMode;
  return {
    typeLabel: opts.labels[used],
    value,
    source: opts.armedMode ? 'forced' : 'auto',
    autoTypeLabel: opts.labels[opts.autoMode],
  };
}
