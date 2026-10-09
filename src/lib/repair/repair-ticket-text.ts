/**
 * The helpdesk ticket a repair drop-off opens — subject and first note, for
 * the counter (kiosk) and the repair desk alike. ONE ticket per device.
 *
 * Operator 2026-10-09: the ticket carries the customer's name, phone and
 * email, the ship-back address, and every product on the visit — and NO
 * internal ids (no RS numbers, no database ids). Whoever opens the ticket can
 * call the customer and knows what is on the bench without opening a record.
 */

import { addBusinessDays } from '@/lib/zendesk';

export interface RepairTicketDevice {
  product: string;
  serial: string;
  issue: string;
  /** As typed / stored (`89`, `89.00`, `$89`); blank = not quoted. */
  quote: string;
  notes: string;
}

export interface RepairTicketFacts {
  /** Where the device was dropped off. */
  channel: 'counter' | 'desk';
  customer: {
    name: string;
    phone: string;
    email: string;
    /** One-line ship-back address; `''` = picks up; `null` = not asked. */
    shipTo: string | null;
  };
  /** Every device on the visit, in drop-off order. */
  devices: readonly RepairTicketDevice[];
  /** Which of `devices` this ticket is for. */
  deviceIndex: number;
  visitNotes: string;
  /** MM/DD/YYYY, or `''` when there is none. */
  dueDate: string;
  priorOrderRef: string | null;
}

/** MM/DD/YYYY due date — five business days out. */
export function formatRepairDueDate(startDate: Date = new Date()): string {
  const date = addBusinessDays(startDate, 5);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

const clean = (value: string | null | undefined) => String(value ?? '').trim();

function money(quote: string): string {
  const amount = clean(quote).replace(/^\$/, '');
  return amount ? `$${amount}` : '';
}

/** `Label: value`, or nothing when the value is blank. */
function fact(label: string, value: string | null | undefined): string | null {
  const text = clean(value);
  return text ? `${label}: ${text}` : null;
}

export function buildRepairTicket(facts: RepairTicketFacts): { subject: string; body: string } {
  const { customer, devices } = facts;
  const device = devices[facts.deviceIndex] ?? devices[0];
  const product = clean(device?.product) || 'Repair service';
  const many = devices.length > 1;

  const lines: Array<string | null> = [
    facts.channel === 'counter'
      ? 'Walk-in repair, dropped off at the counter.'
      : 'Walk-in repair, checked in at the repair desk.',
    many ? `Device ${facts.deviceIndex + 1} of ${devices.length} on this visit.` : null,
    '',
    'CUSTOMER',
    fact('Name', customer.name),
    fact('Phone', customer.phone),
    fact('Email', customer.email),
    customer.shipTo === null
      ? null
      : `Ship to: ${clean(customer.shipTo) || 'none — customer picks up'}`,
    '',
    'DEVICE',
    `Product: ${product}`,
    fact('Serial', device?.serial),
    fact('Issue', device?.issue),
    fact('Quote', money(device?.quote ?? '')),
    fact('Device notes', device?.notes),
  ];

  if (many) {
    lines.push('', 'EVERYTHING DROPPED OFF THIS VISIT');
    devices.forEach((d, i) => {
      const parts = [clean(d.product) || 'Repair service', clean(d.serial) && `serial ${clean(d.serial)}`, clean(d.issue), money(d.quote)];
      lines.push(`${i + 1}. ${parts.filter(Boolean).join(' — ')}`);
    });
  }

  const visit = [fact('Visit notes', facts.visitNotes), fact('Estimated due date', facts.dueDate), fact('Prior order', facts.priorOrderRef)];
  if (visit.some(Boolean)) lines.push('', 'VISIT', ...visit);

  const body = lines
    .filter((line): line is string => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const subject = ['Repair', clean(customer.name), clean(customer.phone), product].filter(Boolean).join(' · ');
  return { subject, body };
}
