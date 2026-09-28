/**
 * Where a print job goes — decided once per press and per STOCK, so the
 * silent path always wins when it exists:
 *
 * Shipping labels (4×6, the `label` printer role):
 *   1. THERMAL_USB / THERMAL_SERIAL — silent printing on and a paired thermal
 *      label printer loaded with 4×6 stock: raw raster over WebUSB / Web Serial.
 *   2. DESKTOP_HOST — silent printing on and the page runs in the Electron /
 *      Tauri shell: silent print to the label profile's OS printer (or the
 *      shell default).
 *   3. BROWSER_DIALOG — silent printing off, or a plain browser with no
 *      thermal printer: one print dialog for the whole batch.
 *
 * Paperwork (packing slips, manuals — letter, the `paper` role) never goes
 * raw to a thermal head: DESKTOP_HOST to the paper profile's OS printer when
 * silent, else the print dialog.
 *
 * A thermal profile on smaller stock (2×1 product labels) is never handed a
 * 4×6 shipping label — the job moves down the ladder instead.
 */
import { resolvePaperSize, type PaperSize, type PrinterProfile, type PrinterRole } from '@/lib/print/browserPrint';
import type { DesktopPrintHost } from '@/lib/print/desktop-print-host';

/** What a document prints on. */
export type PrintStock = 'label' | 'paper';

/** Shipping labels are 4×6 — the stock every label route rasters and pages at. */
export const SHIPPING_LABEL_PAPER: PaperSize = resolvePaperSize('4x6');
/** Packing slips and manuals print on letter. */
export const PAPERWORK_PAPER: PaperSize = resolvePaperSize('letter');

export const STOCK_PAPER: Record<PrintStock, PaperSize> = { label: SHIPPING_LABEL_PAPER, paper: PAPERWORK_PAPER };
const STOCK_ROLE: Record<PrintStock, PrinterRole> = { label: 'label', paper: 'paper' };

export type LabelPrintRoute =
  | { channel: 'THERMAL_USB' | 'THERMAL_SERIAL'; profile: PrinterProfile; printerName: string; paper: PaperSize }
  | { channel: 'DESKTOP_HOST'; host: DesktopPrintHost; printerName: string | null; paper: PaperSize }
  | { channel: 'BROWSER_DIALOG'; printerName: null; paper: PaperSize };

export function resolvePrintRoute(input: {
  stock: PrintStock;
  silent: boolean;
  profiles: readonly PrinterProfile[];
  /** The profile routed to the stock's role, if any. */
  routedProfileId: string | null;
  host: DesktopPrintHost | null;
}): LabelPrintRoute {
  const paper = STOCK_PAPER[input.stock];
  const roleProfiles = input.profiles
    .filter((p) => p.role === STOCK_ROLE[input.stock])
    // The routed profile first, so an operator's explicit pick wins a tie.
    .sort((a, b) => Number(b.id === input.routedProfileId) - Number(a.id === input.routedProfileId));

  if (input.stock === 'label') {
    const thermal = roleProfiles.find((p) => p.kind !== 'os' && p.language !== 'none' && p.paperSizeId === paper.id);
    if (input.silent && thermal) {
      return { channel: thermal.kind === 'serial' ? 'THERMAL_SERIAL' : 'THERMAL_USB', profile: thermal, printerName: thermal.name, paper };
    }
  }

  if (input.silent && input.host) {
    const os = roleProfiles.find((p) => p.kind === 'os');
    return { channel: 'DESKTOP_HOST', host: input.host, printerName: os?.name ?? null, paper };
  }

  return { channel: 'BROWSER_DIALOG', printerName: null, paper };
}
