/**
 * Maps raw station scan strings to UI mode + API routing types.
 * Keeps carrier/serial heuristics in scan-resolver; this layer only adds
 * SKU / repair / FNSKU / command precedence.
 */

import { classifyInput, looksLikeFnsku, looksLikeFnskuPrefix } from './scan-resolver';
import { decodedHandle, scannedUnitKey } from './barcode-routing';

export type StationScanType =
  | 'TRACKING'
  | 'SERIAL'
  | 'FNSKU'
  | 'SKU'
  | 'REPAIR'
  | 'COMMAND'
  /**
   * A payload that decodes to one of OUR printed handles and is NOT a unit
   * serial — a carton, a receiving line, an LPN, a kit manifest, a ticket, a
   * shelf address.
   *
   * Added 2026-08-19. Before it this classifier had NO handle vocabulary at
   * all, so every printed payload landed on `SKU` or `SERIAL`: a carton Digital
   * Link typed `SKU` (rule 1 alone — `input.includes(':')` matches `https:`),
   * and `(01)…(21)…`, `R-1234`, `T-9395`, `A0101101` all typed `SERIAL`. That
   * is how an OCR read of a carton label could be attached as a UNIT's identity
   * (`normalizeSerialRead`) and how the tech bench wrote a shelf code into
   * `tech_serial_numbers`.
   *
   * It deliberately does NOT say which handle it is — callers that need to act
   * on one ask `routeScan` for the answer. This type only says "this is ours,
   * and it is not a serial", which is the fact every consumer was missing.
   */
  | 'HANDLE';
export type StationInputMode = 'tracking' | 'fba' | 'repair' | 'serial';

/**
 * Resolves a raw scan to the controller action type (tracking vs serial vs FBA, …).
 */
export function detectStationScanType(val: string): StationScanType {
  const input = val.trim();
  if (!input) return 'SERIAL';

  // DECODE BEFORE HEURISTICS. Everything below is a shape guess over a string a
  // human might type; a payload we PRINTED has an exact answer, and asking for
  // it first is what stops `https:` being read as a SKU separator.
  // A printed UNIT label is a serial — the one handle that keeps its meaning in
  // this vocabulary. Callers store `unwrapScannedSerial(raw)`, never the raw.
  if (scannedUnitKey(input)) return 'SERIAL';

  // TRUST ONLY A DECODE, NEVER A GUESS — `decodedHandle` is that rule's one
  // home. It keeps a real carrier number (`1Z999…`, which guesses `sku`) and a
  // plain serial (`CN1A2B3XYZ`, which guesses `bin`) out of this branch.
  const printed = decodedHandle(input);
  if (printed) {
    // A repair label routes `receiving` with an `/m/rs/` redirect — a repair
    // order, not a carton (the distinction `scannedReceivingId` also draws).
    if (printed.redirect?.startsWith('/m/rs/')) return 'REPAIR';
    return 'HANDLE';
  }

  if (input.includes(':')) return 'SKU';

  if (/^RS-\d+$/i.test(input)) return 'REPAIR';

  if (looksLikeFnsku(input)) return 'FNSKU';

  if (['YES', 'USED', 'NEW', 'PARTS', 'TEST'].includes(input.toUpperCase())) return 'COMMAND';

  const { type } = classifyInput(input);
  if (type === 'tracking') return 'TRACKING';

  return 'SERIAL';
}

export function getStationInputMode(val: string): StationInputMode {
  const input = String(val || '').trim();
  if (/^RS-/i.test(input)) return 'repair';

  if (looksLikeFnskuPrefix(input)) return 'fba';

  const type = detectStationScanType(input);
  if (type === 'FNSKU') return 'fba';
  if (type === 'REPAIR') return 'repair';
  // A house handle rides the tracking lane: that is the mode whose resolver
  // opens a carton / line / LPN, and it is the only one that will not try to
  // persist the value as a unit identity.
  if (type === 'TRACKING' || type === 'COMMAND' || type === 'HANDLE') return 'tracking';
  return 'serial';
}
