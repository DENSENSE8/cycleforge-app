/**
 * Inbound › Exceptions — the lines that need a PERSON, not time: the carrier
 * delivered it somewhere else, the ERP says received with nothing scanned
 * here, a box sat delivered past the dock SLA, or the carrier cannot track it.
 * Derived on read (`view=exceptions`, SQL in `incoming-exceptions-sql.ts`),
 * never stored. One code per line, the first that applies in
 * {@link INCOMING_EXCEPTION_CODES} order. Client-safe: codes and words only.
 */

import { normalizePostalCode } from '@/lib/receiving/wrong-destination';

/** Priority order: the first that applies is the line's reason. */
export const INCOMING_EXCEPTION_CODES = [
  'WRONG_DESTINATION',
  'ERP_AHEAD',
  'DELIVERED_OVERDUE',
  'STALLED',
  'TRACKING_UNAVAILABLE',
  'CARRIER_MISMATCH',
] as const;
export type IncomingExceptionCode = (typeof INCOMING_EXCEPTION_CODES)[number];

/** Delivered, never scanned, this long → a person walks the dock (the claims band). */
export const DELIVERED_OVERDUE_HOURS = 48;

export function parseIncomingExceptionCode(raw: unknown): IncomingExceptionCode | null {
  return (INCOMING_EXCEPTION_CODES as readonly unknown[]).includes(raw) ? (raw as IncomingExceptionCode) : null;
}

export interface IncomingExceptionReason {
  code: IncomingExceptionCode;
  /** Short label for a badge or a card corner. */
  label: string;
  /** WHY, in the words a receiver acts on. */
  why: string;
  /** The next verb. */
  next: string;
}

/** The facts a reason sentence reads off one row. */
export interface IncomingExceptionFacts {
  exception_code?: string | null;
  shipment_latest_event_postal?: string | null;
  warehouse_postal?: string | null;
  shipment_latest_event_city?: string | null;
  zoho_status?: string | null;
  delivered_at?: string | null;
  carrier?: string | null;
}

const LABEL: Readonly<Record<IncomingExceptionCode, string>> = {
  WRONG_DESTINATION: 'Wrong destination',
  ERP_AHEAD: 'Zoho received · not scanned',
  DELIVERED_OVERDUE: `Delivered ${DELIVERED_OVERDUE_HOURS}h+ · not scanned`,
  STALLED: 'Stalled',
  TRACKING_UNAVAILABLE: 'Tracking unavailable',
  CARRIER_MISMATCH: 'Carrier mismatch',
};

export function incomingExceptionLabel(code: IncomingExceptionCode): string {
  return LABEL[code];
}

/** The pill's verb — the next action in one or two words. */
export const INCOMING_EXCEPTION_VERB: Readonly<Record<IncomingExceptionCode, string>> = {
  WRONG_DESTINATION: 'Investigate',
  ERP_AHEAD: 'Find the box',
  DELIVERED_OVERDUE: 'Walk the dock',
  STALLED: 'Contact carrier',
  TRACKING_UNAVAILABLE: 'Check carrier',
  CARRIER_MISMATCH: 'Fix tracking',
};

/** One row → why it needs a person and what to do next. Null when it does not. */
export function incomingExceptionReason(row: IncomingExceptionFacts): IncomingExceptionReason | null {
  const code = parseIncomingExceptionCode(row.exception_code);
  if (!code) return null;
  const label = LABEL[code];
  switch (code) {
    case 'WRONG_DESTINATION': {
      const to = normalizePostalCode(row.shipment_latest_event_postal);
      const home = normalizePostalCode(row.warehouse_postal);
      const place = [row.shipment_latest_event_city?.trim(), to].filter(Boolean).join(' ');
      return {
        code,
        label,
        why: `Carrier delivered to ${place || 'another address'}${home ? ` — warehouse is ${home}` : ''}`,
        next: 'Investigate with the carrier and the seller',
      };
    }
    case 'ERP_AHEAD':
      return {
        code,
        label,
        why: `Zoho says ${String(row.zoho_status || 'received').toLowerCase()} — nobody scanned it here`,
        next: 'Find the box on the dock, or correct the receipt in Zoho',
      };
    case 'DELIVERED_OVERDUE':
      return {
        code,
        label,
        why: `Carrier delivered it more than ${DELIVERED_OVERDUE_HOURS} hours ago — still not scanned`,
        next: 'Walk the dock; if it is not here, open a claim',
      };
    case 'STALLED':
      return {
        code,
        label,
        why: 'The carrier flagged an exception or has not scanned it in 3+ days',
        next: 'Contact the carrier',
      };
    case 'TRACKING_UNAVAILABLE':
      return {
        code,
        label,
        why: 'The carrier is refusing tracking requests for this number',
        next: 'Check the carrier site by hand',
      };
    case 'CARRIER_MISMATCH':
      return {
        code,
        label,
        why: `${row.carrier ? `${row.carrier} has` : 'The carrier has'} no record of this tracking number`,
        next: 'Fix the tracking number or reassign the carrier',
      };
  }
}
