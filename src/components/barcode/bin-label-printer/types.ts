
/**
 * Per-browser layout counts for the bin builder.
 *
 * **No `gln` here, deliberately.** It lived in this config (and in the rack
 * printer's twin) until 2026-08-02, which made a per-TENANT legal identifier a
 * per-BROWSER preference: two operators could print the same rack with
 * different GLNs, and neither matched `organizations.settings.gs1.gln` — the
 * value the print ladder, the interop projections and Settings all read. The
 * GLN now comes from `useOrgGs1()`; these counts stay local because a warehouse
 * layout genuinely is a property of the machine you build labels on.
 */
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
  { id: 'bay', label: 'Bay' },
  { id: 'level', label: 'Level' },
  { id: 'position', label: 'Position' },
];
