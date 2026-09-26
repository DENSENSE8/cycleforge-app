/** The read-only ID preview — "what would this scan do?" as data. */

import { dispatchScan, type ScanCard, type DispatchMode } from './dispatch-table';
import { routeScan, type ScanRoute, type ScanType } from '../barcode-routing';

/** What the operator's word for each scan class is. Display only. */
const CLASS_LABEL: Record<ScanType, string> = {
  sku: 'Product label',
  bin: 'Bin',
  'bin-paired-order': 'Bin (order-paired)',
  receiving: 'Carton handle',
  'receiving-line': 'Carton line',
  'serial-unit': 'Unit',
  'handling-unit': 'Licence plate (LPN)',
  manifest: 'Kit label',
  'support-ticket': 'Support ticket',
  'carrier-tracking': 'Carrier tracking',
  sscc: 'SSCC pallet',
  fnsku: 'FBA label (FNSKU)',
};

/**
 * The next process, per Card — one sentence each, present tense, no jargon the
 * tape does not already use. `arrival` says the DOOR, matching the workstation
 * pivot: the card names work, never a destination called "Arrival".
 */
const NEXT_PROCESS: Record<ScanCard, string> = {
  arrival: 'Recorded at the door — the Intake block opens.',
  carton: 'Opens this carton at the stage it is already in.',
  qc: 'Opens the open QC check on this licence plate.',
  pack: 'Opens pack-out for what this is paired to.',
  preview: 'Opens the read-only page — no work starts.',
};

/** What a scan would do, said in words. Never rendered by this module. */
interface ScanPreview {
  /** The raw bytes, echoed so the operator can eye-match the label. */
  raw: string;
  /** The class of the label, in the operator's words. */
  classLabel: string;
  /** The Card the dispatch table chose. */
  card: ScanCard;
  /** Where the scan lands, in words — the same string the Field names. */
  destination: string;
  /** The dispatch mode: `act` only an armed session can earn. */
  mode: DispatchMode;
  /** The session title this scan would set, or `null` to keep the current one. */
  title: string | null;
  /** Why the table chose this row — the audit line under the sentence. */
  reason: string;
  /** The one sentence: what the next process for this ID is. */
  next: string;
}

/**
 * Preview one scan. Returns `null` when the bytes are not a label this system
 * knows — an honest "cannot say", never a guess dressed as an answer.
 */
export function previewScan(input: {
  scan: string | ScanRoute;
  state?: Parameters<typeof dispatchScan>[0]['state'];
  armedSession?: Parameters<typeof dispatchScan>[0]['armedSession'];
}): ScanPreview | null {
  const scan = typeof input.scan === 'string' ? routeScan(input.scan) : input.scan;
  if (!scan) return null;

  const d = dispatchScan({ scan, state: input.state, armedSession: input.armedSession ?? null });

  let next: string;
  if (d.mode === 'ask') {
    next = 'Two cards matched — the Field asks before anything opens.';
  } else if (d.mode === 'act') {
    next = `Advances the armed block. ${NEXT_PROCESS[d.card]}`;
  } else {
    next = NEXT_PROCESS[d.card];
  }
  return {
    raw: scan.value,
    classLabel: CLASS_LABEL[scan.type] ?? scan.type,
    card: d.card,
    destination: d.destination,
    mode: d.mode,
    title: d.title,
    reason: d.reason,
    next,
  };
}
