'use client';

import { useBarcodeMode } from '@/hooks/useBarcodeMode';
import type { BarcodeMode } from '@/components/barcode/ModeSelector';

export interface UseBarcodeModeStep {
  mode: BarcodeMode;
  /** Switch mode (URL-driven) — writes `?mode=`. */
  handleModeChange: (next: BarcodeMode) => void;
}

/**
 * Owns the print/log/reprint mode for the unit-label workspace, read and
 * written through the URL (`useBarcodeMode`) so the mode is deep-linkable.
 *
 * This used to carry a second, local-state mode plus a 1→2→3 wizard step and a
 * scroll-into-view anchor, for a narrow-column `vertical` layout. That layout
 * was deleted 2026-08-01: `MultiSkuSnBarcode`'s only mount passes
 * `layout="horizontal"`, so the `vertical` branch was reachable solely through
 * a default parameter no caller took.
 */
export function useBarcodeModeStep(): UseBarcodeModeStep {
  const { mode, setMode } = useBarcodeMode();
  return { mode, handleModeChange: setMode };
}
