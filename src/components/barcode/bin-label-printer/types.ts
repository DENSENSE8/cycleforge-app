
export interface PrinterConfig {
  maxAisles: number;
  maxBays: number;
  maxLevels: number;
  maxPositions: number;
  gln: string;
}

export const DEFAULT_CONFIG: PrinterConfig = {
  maxAisles: 6,
  maxBays: 12,
  maxLevels: 5,
  maxPositions: 20,
  // No default GLN. A GLN is a LICENSED identifier — the old
  // `DEFAULT_GLN` placeholder printed GS1's documentation number on every
  // label. Empty means "this warehouse asserts no GLN", which is a legal
  // state; the label then carries the bare location code.
  gln: '',
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
  { id: 'bay', label: 'Bay' },
  { id: 'level', label: 'Level' },
  { id: 'position', label: 'Position' },
];
