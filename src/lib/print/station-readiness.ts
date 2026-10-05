/**
 * What THIS computer can print right now, per stock — the readiness a print
 * station reports, whether it is a staff browser's station (the bridge host)
 * or an enrolled station (`/print-station/device`). Browser-only.
 */

import { getProfileForRole, type PrinterProfile } from '@/lib/print/browserPrint';
import { isSilentPrintEnabled } from '@/lib/print/printMode';

/** A desk browser (fine pointer) can always print through its own print path: the dialog is the floor. */
export function deskBrowserCanPrint(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true;
}

export interface StationStockReadiness {
  ready: boolean;
  /** The routed printer profile for the stock, when one is set up. */
  profile: PrinterProfile | null;
}

/** This computer's readiness: silent printing, and per stock whether it can print now. */
export interface LocalStationReadiness {
  silent: boolean;
  label: StationStockReadiness;
  paper: StationStockReadiness;
}

/** Silent printing on, and per stock: a routed printer (a raw label printer for labels) or a desk browser. */
export function localStationReadiness(): LocalStationReadiness {
  const label = getProfileForRole('label');
  const paper = getProfileForRole('paper');
  const silent = isSilentPrintEnabled();
  const labelUsb = !!label && label.kind !== 'os' && label.language !== 'none';
  const browserPrint = deskBrowserCanPrint();
  return {
    silent,
    label: { ready: silent && (labelUsb || browserPrint), profile: label },
    paper: { ready: silent && (!!paper || browserPrint), profile: paper },
  };
}
