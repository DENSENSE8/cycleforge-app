/** The hub "Information" edit: */

import { parseLegacyContactInfo } from './contact-info';
import { CustomerContactPatchBody, RepairCustomerCreateBody, type CustomerContactPatch } from '@/lib/schemas/customers';

/** A customer picked from `/api/customers/search`. */
export interface PickedCustomer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

/** What Save does to the repair's customer link. */
export type CustomerIntent =
  | { kind: 'keep' }
  | { kind: 'link'; customer: PickedCustomer }
  | { kind: 'create' }
  | { kind: 'unlink' };

interface RepairContactFields {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

export interface RepairInfoDraft extends RepairContactFields {
  productTitle: string;
  issue: string;
  serialNumber: string;
  price: string;
  notes: string;
  sourceSystem: string;
  sourceOrderId: string;
  sourceTrackingNumber: string;
  sourceSku: string;
  intakeChannel: string;
  customer: CustomerIntent;
}

/** Row shape this reads — structural so `RSRecord` fits without importing server code. */
export interface RepairInfoSource {
  product_title?: string | null;
  issue?: string | null;
  serial_number?: string | null;
  price?: string | null;
  notes?: string | null;
  source_system?: string | null;
  source_order_id?: string | null;
  source_tracking_number?: string | null;
  source_sku?: string | null;
  intake_channel?: string | null;
  contact_info?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
}

interface RepairInfoWrite {
  /** Operator word for the fact, shown on the Save button and in errors. */
  label: string;
  method: 'PATCH' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: Record<string, unknown>;
}

interface RepairInfoPlan {
  writes: RepairInfoWrite[];
  /** Why the draft cannot be saved (operator words); null when it can. */
  problem: string | null;
}

const KEEP: CustomerIntent = { kind: 'keep' };

const contactFields = (
  name: string | null | undefined,
  phone: string | null | undefined,
  email: string | null | undefined,
): RepairContactFields => ({
  contactName: (name ?? '').trim(),
  contactPhone: (phone ?? '').trim(),
  contactEmail: (email ?? '').trim(),
});

function legacyContact(row: RepairInfoSource): RepairContactFields {
  const c = parseLegacyContactInfo(row.contact_info);
  return contactFields(c.name, c.phone, c.email);
}

/**
 * What the contact fields hold before any typing, for an intent: the linked
 * record's own columns, the picked customer, the intake string (unlinked or
 * about to unlink), or blanks for a new record replacing a linked one.
 */
function contactSeed(row: RepairInfoSource, intent: CustomerIntent): RepairContactFields {
  switch (intent.kind) {
    case 'keep':
      return row.customer_id != null
        ? contactFields(row.customer_name, row.customer_phone, row.customer_email)
        : legacyContact(row);
    case 'link':
      return contactFields(intent.customer.name, intent.customer.phone, intent.customer.email);
    case 'create':
      return row.customer_id != null ? contactFields('', '', '') : legacyContact(row);
    case 'unlink':
      return legacyContact(row);
  }
}

export function repairInfoDraft(row: RepairInfoSource): RepairInfoDraft {
  return {
    productTitle: row.product_title ?? '',
    issue: row.issue ?? '',
    serialNumber: row.serial_number ?? '',
    price: row.price ?? '',
    notes: row.notes ?? '',
    sourceSystem: row.source_system ?? '',
    sourceOrderId: row.source_order_id ?? '',
    sourceTrackingNumber: row.source_tracking_number ?? '',
    sourceSku: row.source_sku ?? '',
    intakeChannel: row.intake_channel ?? '',
    customer: KEEP,
    ...contactSeed(row, KEEP),
  };
}

/**
 * Stage a link change: the contact fields re-seed from the new intent, every
 * other fact keeps what was typed. Picking the customer already linked, or
 * unlinking a repair with none, is no change.
 */
export function withCustomerIntent(
  row: RepairInfoSource,
  draft: RepairInfoDraft,
  intent: CustomerIntent,
): RepairInfoDraft {
  const noop =
    (intent.kind === 'link' && intent.customer.id === row.customer_id) ||
    (intent.kind === 'unlink' && row.customer_id == null);
  const next = noop ? KEEP : intent;
  return { ...draft, customer: next, ...contactSeed(row, next) };
}

/** Same join the intake writes (`[name, phone, email].filter(Boolean).join(', ')`). */
function joinContact(c: RepairContactFields): string {
  return [c.contactName, c.contactPhone, c.contactEmail]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

/** The customer-record fields that differ from `seed`; null when none do. */
function contactPatch(seed: RepairContactFields, typed: RepairContactFields): CustomerContactPatch | null {
  const patch: CustomerContactPatch = {};
  if (typed.contactName !== seed.contactName) patch.name = typed.contactName;
  if (typed.contactPhone !== seed.contactPhone) patch.phone = typed.contactPhone;
  if (typed.contactEmail !== seed.contactEmail) patch.email = typed.contactEmail;
  return Object.keys(patch).length ? patch : null;
}

/** First schema message, so the sheet refuses what the route would 400 on. */
function schemaProblem(result: { success: true } | { success: false; error: { issues: { message: string }[] } }) {
  return result.success ? null : (result.error.issues[0]?.message ?? 'Contact is not valid');
}

function customerPlan(id: number, row: RepairInfoSource, draft: RepairInfoDraft): RepairInfoPlan {
  const intent = draft.customer;
  const typed = contactFields(draft.contactName, draft.contactPhone, draft.contactEmail);
  const seed = contactSeed(row, intent);
  const writes: RepairInfoWrite[] = [];
  let problem: string | null = null;

  const intakeContact = () => {
    const value = joinContact(typed);
    if (value !== joinContact(seed)) {
      writes.push({ label: 'Customer', method: 'PATCH', url: '/api/repair-service', body: { id, field: 'contact_info', value } });
    }
  };
  const recordContact = (customerId: number) => {
    const patch = contactPatch(seed, typed);
    if (!patch) return;
    problem ??= schemaProblem(CustomerContactPatchBody.safeParse(patch));
    writes.push({ label: 'Customer', method: 'PATCH', url: `/api/customers/${customerId}`, body: patch });
  };

  switch (intent.kind) {
    case 'keep':
      if (row.customer_id != null) recordContact(row.customer_id);
      else intakeContact();
      break;
    case 'link':
      writes.push({
        label: 'Change customer',
        method: 'PUT',
        url: `/api/repair-service/${id}/customer`,
        body: { customerId: intent.customer.id },
      });
      recordContact(intent.customer.id);
      break;
    case 'create': {
      const body = { name: typed.contactName, phone: typed.contactPhone, email: typed.contactEmail };
      problem = schemaProblem(RepairCustomerCreateBody.safeParse(body));
      writes.push({ label: 'New customer', method: 'POST', url: `/api/repair-service/${id}/customer`, body });
      break;
    }
    case 'unlink':
      if (row.customer_id != null) {
        writes.push({ label: 'Unlink customer', method: 'DELETE', url: `/api/repair-service/${id}/customer` });
      }
      intakeContact();
      break;
  }
  return { writes, problem };
}

/**
 * The writes that turn `row` into `draft`, in on-screen order; unchanged facts
 * send nothing. Values are trimmed except notes (line breaks are the
 * operator's). `problem` is set when a contact write would be refused.
 */
export function repairInfoPlan(id: number, row: RepairInfoSource, draft: RepairInfoDraft): RepairInfoPlan {
  const before = repairInfoDraft(row);
  const writes: RepairInfoWrite[] = [];
  const field = (label: string, name: string, prev: string, next: string) => {
    const value = next.trim();
    if (value !== prev.trim()) {
      writes.push({ label, method: 'PATCH', url: '/api/repair-service', body: { id, field: name, value } });
    }
  };

  field('Device', 'product_title', before.productTitle, draft.productTitle);
  field('Issue', 'issue', before.issue, draft.issue);
  field('Serial', 'serial_number', before.serialNumber, draft.serialNumber);
  field('Source system', 'source_system', before.sourceSystem, draft.sourceSystem);
  field('Source order', 'source_order_id', before.sourceOrderId, draft.sourceOrderId);
  field('Tracking', 'source_tracking_number', before.sourceTrackingNumber, draft.sourceTrackingNumber);
  field('SKU', 'source_sku', before.sourceSku, draft.sourceSku);
  field('Ingress', 'intake_channel', before.intakeChannel, draft.intakeChannel);
  const customer = customerPlan(id, row, draft);
  writes.push(...customer.writes);
  field('Price', 'price', before.price, draft.price);
  if (draft.notes !== before.notes) {
    writes.push({ label: 'Notes', method: 'PATCH', url: '/api/repair-service', body: { id, notes: draft.notes } });
  }
  return { writes, problem: customer.problem };
}

/** The draft laid onto a row for the optimistic view (the server re-read replaces it). */
export function applyRepairInfoDraft<T extends RepairInfoSource>(row: T, draft: RepairInfoDraft): T {
  const typed = contactFields(draft.contactName, draft.contactPhone, draft.contactEmail);
  const record = {
    customer_name: typed.contactName || null,
    customer_phone: typed.contactPhone || null,
    customer_email: typed.contactEmail || null,
  };
  const intent = draft.customer;
  const intake = { contact_info: joinContact(typed) === joinContact(contactSeed(row, intent)) ? row.contact_info : joinContact(typed) };
  const customer =
    intent.kind === 'keep'
      ? row.customer_id != null
        ? record
        : intake
      : intent.kind === 'link'
        ? { customer_id: intent.customer.id, ...record }
        : intent.kind === 'create'
          ? record
          : { customer_id: null, customer_name: null, customer_phone: null, customer_email: null, ...intake };
  return {
    ...row,
    product_title: draft.productTitle.trim(),
    issue: draft.issue.trim(),
    serial_number: draft.serialNumber.trim(),
    price: draft.price.trim(),
    source_system: draft.sourceSystem.trim(),
    source_order_id: draft.sourceOrderId.trim(),
    source_tracking_number: draft.sourceTrackingNumber.trim(),
    source_sku: draft.sourceSku.trim(),
    intake_channel: draft.intakeChannel.trim(),
    notes: draft.notes,
    ...customer,
  };
}
