
/** Per-browser layout counts for the bin builder. */
import { LOCATION_BAY_LABEL } from '@/lib/barcode-routing';

export interface PrinterConfig {
  maxAisles: number;
  maxBays: number;
  maxLevels: number;
  maxPositions: number;
}

export const DEFAULT_CONFIG: PrinterConfig = {
  maxAisles: 6,
  maxBays: 12,
  maxLevels: 5,
  maxPositions: 20,
};

export const CONFIG_KEY = 'binPrinter.config.v4';

/**
 * Where the printer is being rendered. `main` = full-width pane (mobile shows
 * the full picker + preview; lg+ collapses to a giant preview because the picker
 * moves to the sidebar). `sidebar` = narrow rail, picker only.
 */
export type LabelPrinterVariant = 'main' | 'sidebar';

export type Step = 'zone' | 'aisle' | 'bay' | 'level' | 'position';

export const STEPS: { id: Step; label: string }[] = [
  { id: 'zone', label: 'Zone' },
  { id: 'aisle', label: 'Aisle' },
  { id: 'bay', label: LOCATION_BAY_LABEL },
  { id: 'level', label: 'Level' },
  { id: 'position', label: 'Position' },
];
