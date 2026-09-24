/**
 * Walk-in visit triage — ONE model of "what is wrong with this ticket".
 *
 * The kiosk had exactly one consumer of this knowledge: a `blockReason` string
 * computed inside `KioskCartLedger` that returned the FIRST problem and threw
 * the rest away. An operator with three incomplete lines got one sentence, fixed
 * it, and was told about the next one — with no way to see the whole list, and
 * no way to tell WHICH line the sentence was about.
 *
 * This is that knowledge as data: every open issue, attributed to the line (or
 * to the customer block) that owns it, ordered worst-first. The submit gate and
 * the Triage panel both read it, so the button and the list can never disagree.
 *
 * Pure over the session snapshot — no store, no network, no React.
 */

import {
  cartIsEmpty,
  isBuybackPayload,
  isLinkedRepairLine,
  isRepairPayload,
  type KioskCartLine,
} from '@/lib/kiosk/cart-line';

/** `block` stops submit; `warn` is worth fixing but ships. */
export type KioskTriageSeverity = 'block' | 'warn';

/** Where the fix lives — the panel routes the operator straight there. */
export type KioskTriageTarget = 'customer' | 'line' | 'cart';

export interface KioskTriageItem {
  /** Stable per (target, field, line) so React keys and tests are steady. */
  id: string;
  severity: KioskTriageSeverity;
  target: KioskTriageTarget;
  /** Set when `target === 'line'`. */
  lineId?: string;
  /** Line title, so the panel can name the thing without re-looking it up. */
  lineTitle?: string;
  /** The field an operator must fill — drives focus in the line editor. */
  field?: 'serial' | 'price' | 'signature' | 'imei' | 'phone' | 'quantity';
  message: string;
}

export interface KioskTriageSession {
  lines: KioskCartLine[];
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  /** Callers: KioskCartLedger, KioskShell. API: none (pure). Schema: session snapshot. User: "intake their information like name, email address, phone number, address". */
  customerAddress?: string;
}

function repairIssues(line: KioskCartLine): KioskTriageItem[] {
  if (!isRepairPayload(line.payload)) return [];
  // A linked repair's serial, symptom and signature were captured when its
  // ticket was written; demanding them again would block a visit on facts the
  // book already holds. Its money is read from that ticket at submit.
  if (isLinkedRepairLine(line)) return [];
  const p = line.payload;
  const out: KioskTriageItem[] = [];
  const base = { target: 'line' as const, lineId: line.id, lineTitle: line.title };

  if (!p.serialNumber?.trim()) {
    out.push({
      ...base,
      id: `${line.id}:serial`,
      severity: 'block',
      field: 'serial',
      message: 'Repair needs a serial number.',
    });
  }
  if (!String(p.price ?? '').trim()) {
    out.push({
      ...base,
      id: `${line.id}:price`,
      severity: 'block',
      field: 'price',
      message: 'Repair needs a quoted price.',
    });
  }
  if (!p.signatureDataUrl) {
    out.push({
      ...base,
      id: `${line.id}:signature`,
      severity: 'block',
      field: 'signature',
      message: 'Repair drop-off needs the customer signature.',
    });
  }
  if (!p.repairReasons?.length && !p.repairNotes?.trim()) {
    out.push({
      ...base,
      id: `${line.id}:issue`,
      severity: 'warn',
      message: 'No issue recorded — the tech gets no symptom to test against.',
    });
  }
  return out;
}

function buybackIssues(line: KioskCartLine): KioskTriageItem[] {
  if (!isBuybackPayload(line.payload)) return [];
  const out: KioskTriageItem[] = [];
  if (!line.payload.imei?.trim()) {
    out.push({
      id: `${line.id}:imei`,
      severity: 'block',
      target: 'line',
      lineId: line.id,
      lineTitle: line.title,
      field: 'imei',
      message: 'Trade-in needs an IMEI — it is the only identifier on the paperwork.',
    });
  }
  if (line.unitAmountCents === 0) {
    out.push({
      id: `${line.id}:offer`,
      severity: 'warn',
      target: 'line',
      lineId: line.id,
      lineTitle: line.title,
      field: 'price',
      message: 'Trade-in credit is $0.00.',
    });
  }
  return out;
}

function retailIssues(line: KioskCartLine): KioskTriageItem[] {
  if (isRepairPayload(line.payload) || isBuybackPayload(line.payload)) return [];
  const out: KioskTriageItem[] = [];
  if (line.quantity < 1) {
    out.push({
      id: `${line.id}:quantity`,
      severity: 'block',
      target: 'line',
      lineId: line.id,
      lineTitle: line.title,
      field: 'quantity',
      message: 'Quantity must be at least 1.',
    });
  }
  if (line.unitAmountCents === 0) {
    out.push({
      id: `${line.id}:price`,
      severity: 'warn',
      target: 'line',
      lineId: line.id,
      lineTitle: line.title,
      field: 'price',
      message: 'Item is priced at $0.00 — confirm it is intentional.',
    });
  }
  return out;
}

/**
 * Every open issue on the visit, blockers first, then in cart order.
 *
 * Cart-level problems (empty cart, more than one repair) come before line
 * problems: fixing a line is pointless while the ticket itself cannot submit.
 */
export function collectKioskTriage(session: KioskTriageSession): KioskTriageItem[] {
  const cartLevel: KioskTriageItem[] = [];

  if (cartIsEmpty(session.lines)) {
    cartLevel.push({
      id: 'cart:empty',
      severity: 'block',
      target: 'cart',
      message: 'Cart is empty — scan a barcode or tap an item in the catalog.',
    });
  }

  const phone = session.customerPhone.trim();
  const digits = phone.replace(/\D/g, '');
  if (!phone) {
    cartLevel.push({
      id: 'customer:phone',
      severity: 'block',
      target: 'customer',
      field: 'phone',
      message: 'Enter a phone number — it is how the visit is matched to a customer.',
    });
  } else if (digits.length < 7) {
    cartLevel.push({
      id: 'customer:phone-short',
      severity: 'block',
      target: 'customer',
      field: 'phone',
      message: 'Phone number looks incomplete.',
    });
  }
  if (!session.customerName.trim()) {
    cartLevel.push({
      id: 'customer:name',
      severity: 'warn',
      target: 'customer',
      message: 'No customer name on the visit.',
    });
  }
  if (!session.customerEmail?.trim()) {
    cartLevel.push({
      id: 'customer:email',
      severity: 'warn',
      target: 'customer',
      message: 'No email on the visit.',
    });
  }
  if (!session.customerAddress?.trim()) {
    cartLevel.push({
      id: 'customer:address',
      severity: 'warn',
      target: 'customer',
      message: 'No address on the visit.',
    });
  }

  /*
   * There used to be a cart-level BLOCKER here — "Only one repair per visit is
   * submitted — remove N extra." It existed because the submit path kept the
   * first repair and silently discarded the rest, so refusing the visit was the
   * least-bad option: better to make the operator delete a device than to take
   * it in and lose the record.
   *
   * Removed 2026-08-21 with SQ6: `submitCounterTransaction` now writes one
   * `repair_service` row per device (the DB always allowed it —
   * repair_service.counter_transaction_id is many→one). A second device is a
   * normal visit, and each one raises its own per-line blockers (serial, price,
   * signature) from `repairIssues` above, so nothing is under-checked by
   * dropping the cap.
   */

  const lineLevel = session.lines.flatMap((line) => [
    ...repairIssues(line),
    ...buybackIssues(line),
    ...retailIssues(line),
  ]);

  const all = [...cartLevel, ...lineLevel];
  // Stable partition, never a sort — cart order is meaningful to the operator.
  return [
    ...all.filter((i) => i.severity === 'block'),
    ...all.filter((i) => i.severity === 'warn'),
  ];
}

/** The submit gate — the first blocker's message, or null when clear. */
export function firstKioskBlocker(session: KioskTriageSession): string | null {
  const blocker = collectKioskTriage(session).find((i) => i.severity === 'block');
  return blocker?.message ?? null;
}

/** Badge count for the Triage rail glyph — blockers only. */
export function countKioskBlockers(session: KioskTriageSession): number {
  return collectKioskTriage(session).filter((i) => i.severity === 'block').length;
}
