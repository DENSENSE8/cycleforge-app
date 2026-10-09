/**
 * The walk-in's repair PAPERWORK — one agreement sheet per unit on the counter.
 * (operator 2026-09-25: "paperwork should just be paperwork").
 */

import {
  repairReceiptPropsForDevice,
  type RepairReceiptCustomer,
  type RepairReceiptProps,
} from '@/lib/repair/repair-intake-receipt';
import { isRepairPayload, type KioskCartLine } from './cart-line';
import type { KioskRepairDevice } from './repair-devices';

interface RepairPaperworkFacts {
  customer: RepairReceiptCustomer;
  /** The visit's free-text notes — a unit with no reasons states these as its issue. */
  visitNotes: string;
  /** The visit's units, from `repairDevicesFromLines` (linked repairs already excluded). */
  devices: readonly Pick<
    KioskRepairDevice,
    'lineId' | 'title' | 'serialNumber' | 'price' | 'repairReasons'
  >[];
  /** The number the sheet heading states; `''` collapses to no heading. */
  ticketNumber: string | number;
  /** The visit's ship-back address on one line; `''` = pickup. */
  shipTo: string;
}

interface RepairPaperworkSheet {
  /** The unit's cart line — the sheet's React key. */
  lineId: string;
  props: RepairReceiptProps;
}

export function repairPaperworkSheets(facts: RepairPaperworkFacts): RepairPaperworkSheet[] {
  return facts.devices.map((device) => ({
    lineId: device.lineId,
    props: {
      ...repairReceiptPropsForDevice(
        facts.customer,
        device,
        device.repairReasons.join(', ') || facts.visitNotes,
        '',
        facts.ticketNumber,
      ),
      shipTo: facts.shipTo,
    },
  }));
}

/**
 * The VISIT facts as the cart holds them. The repair pane mirrors notes and
 * signature onto EVERY repair line while it is open, so the first one answers
 * for the visit — which is how a surface outside the pane reads them.
 */
export function repairVisitFactsFromLines(lines: readonly KioskCartLine[]): {
  notes: string;
  signatureDataUrl: string | null;
  signatureStrokes: unknown;
} {
  for (const line of lines) {
    if (line.type !== 'REPAIR' || !isRepairPayload(line.payload)) continue;
    return {
      notes: line.payload.repairNotes ?? '',
      signatureDataUrl: line.payload.signatureDataUrl ?? null,
      signatureStrokes: line.payload.signatureStrokes ?? null,
    };
  }
  return { notes: '', signatureDataUrl: null, signatureStrokes: null };
}
