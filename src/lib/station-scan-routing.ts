/**
 * Maps raw station scan strings to UI mode + API routing types.
 * Keeps carrier/serial heuristics in scan-resolver; this layer only adds
 * SKU / repair / FNSKU / command precedence.
 */

import { classifyInput, looksLikeFnsku, looksLikeFnskuPrefix } from './scan-resolver';
import { decodedHandle, scannedUnitKey } from './barcode-routing';
import { isCommandNamespace, parseNavCommand } from './stations/nav-command-codes';
import { parseActionCommand } from './stations/action-command-codes';

export type StationScanType =
  /** A registered `CMD-GO-*` sticker — move the operator to another surface. */
  | 'NAV'
  /**
   * A registered `CMD-<VERB>` / `CMD-<VERB>-GO-<TARGET>` sticker — record a
   * verdict on the unit in hand, and (for a compound) then move. The only scan
   * type that writes.
   */
  | 'ACTION'
  | 'TRACKING'
  | 'SERIAL'
  | 'FNSKU'
  | 'SKU'
  | 'REPAIR'
  | 'COMMAND'
  /** A payload that decodes to one of OUR printed handles and is NOT a unit serial — a carton, a receiving line, an LPN, a kit manifest, a… */
  | 'HANDLE';
export type StationInputMode = 'tracking' | 'fba' | 'repair' | 'serial';

/**
 * Resolves a raw scan to the controller action type (tracking vs serial vs FBA, …).
 */
export function detectStationScanType(val: string): StationScanType {
  const input = val.trim();
  if (!input) return 'SERIAL';

  // COMMANDS BEFORE EVERYTHING.
  if (parseNavCommand(input)) return 'NAV';
  if (parseActionCommand(input)) return 'ACTION';
  if (isCommandNamespace(input)) return 'COMMAND';

  // DECODE BEFORE HEURISTICS.
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
  if (
    type === 'TRACKING' ||
    type === 'COMMAND' ||
    type === 'NAV' ||
    type === 'ACTION' ||
    type === 'HANDLE'
  ) {
    return 'tracking';
  }
  return 'serial';
}
