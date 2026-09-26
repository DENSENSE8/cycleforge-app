'use client';

import { useBarcodeMode } from '@/hooks/useBarcodeMode';
import type { BarcodeMode } from '@/components/barcode/ModeSelector';

interface UseBarcodeModeStep {
  mode: BarcodeMode;
  /** Switch mode (URL-driven) — writes `?mode=`. */
  handleModeChange: (next: BarcodeMode) => void;
}

/** Owns the print/log/reprint mode for the unit-label workspace, read and written through the URL (`useBarcodeMode`) so the mode is… */
export function useBarcodeModeStep(): UseBarcodeModeStep {
  const { mode, setMode } = useBarcodeMode();
  return { mode, handleModeChange: setMode };
}
