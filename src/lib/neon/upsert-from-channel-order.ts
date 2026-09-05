/**
 * upsertCustomerFromChannelOrder — hydrate the buyer of an online order into
 * `customers` (in-store channel exchange, CX1).
 *
 * The counter's own identity path (`submitCounterTransaction`) is phone-only
 * and deliberately so: a bare NAME match silently merges two different
 * "John Smith"s onto one record, which at a counter is a stranger's history
 * attached to the wrong person. This helper keeps that rule and adds exactly
 * one key the counter does not have — the EMAIL off the channel order, which
 * is not typed by a walk-in and is not guessable from the tablet.
 *
 * Order is the whole design (plan X4):
 *
 *   1. last-10 phone digits, org-scoped  — the counter's own rule, so a
 *      returning walk-in and the online buyer land on ONE row
 *   2. email, org-scoped                 — the channel's key; a customer who
 *      bought online with a different phone is still not a new person
 *   3. create
 *
 * Never a name branch. Never a fuzzy match.
 *
 * `channel_refs` is MERGED (`||`), never replaced: a customer who has bought
 * on two channels has two refs, and clobbering is how the other one silently
 * disappears.
 *
 * Deps-injected so the branch table above is asserted with zero DB —
 * see upsert-from-channel-order.test.ts.
 */

import type { ChannelOrder } from '@/lib/ecwid/client';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** The subset of a customer row this path reads or writes. */
export interface ChannelCustomerRow {
  id: number;
  /** The phone AS STORED — the counter threads this into `submitRepairIntake`,
   *  whose own lookup is an exact string match. */
  storedPhone: string;
  storedName: string;
  storedEmail: string;
}

export type ChannelCustomerMatch = 'phone' | 'email' | 'created';

export interface UpsertCustomerFromChannelOrderResult {
  customer: ChannelCustomerRow;
  matchedBy: ChannelCustomerMatch;
  /** Non-fatal degradations — never a reason to fail the visit. */
  warnings: string[];
}

export interface UpsertCustomerFromChannelOrderDeps {
  findByPhoneDigits(orgId: OrgId, phoneDigits: string): Promise<ChannelCustomerRow | null>;
  findByEmail(orgId: OrgId, email: string): Promise<ChannelCustomerRow | null>;
  createCustomer(
    orgId: OrgId,
    args: { name: string; phone: string; email: string },
  ): Promise<ChannelCustomerRow>;
  /** `channel_refs = channel_refs || $refs` — merge, never replace. */
  mergeChannelRefs(orgId: OrgId, customerId: number, refs: Record<string, string>): Promise<void>;
  /** Fill blanks only. Never overwrites a value already on the row. */
  fillContactGaps(
    orgId: OrgId,
    customerId: number,
    gaps: { email?: string; phone?: string; name?: string },
  ): Promise<void>;
}

/** Trailing N digits of a phone, formatting-insensitive. Same rule as the counter's. */
function lastDigits(value: string | null | undefined, n = 10): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length <= n ? digits : digits.slice(-n);
}

const CUSTOMER_SELECT = `
  SELECT id,
         phone,
         email,
         COALESCE(
           NULLIF(display_name, ''),
           NULLIF(customer_name, ''),
           NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
         ) AS name
    FROM customers`;

function toRow(row: Record<string, unknown> | undefined): ChannelCustomerRow | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    storedPhone: (row.phone as string | null) ?? '',
    storedName: (row.name as string | null) ?? '',
    storedEmail: (row.email as string | null) ?? '',
  };
}

export const defaultUpsertChannelCustomerDeps: UpsertCustomerFromChannelOrderDeps = {
  async findByPhoneDigits(orgId, phoneDigits) {
    const res = await tenantQuery<Record<string, unknown>>(
      orgId,
      `${CUSTOMER_SELECT}
        WHERE organization_id = $1
          AND phone IS NOT NULL
          AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [orgId, phoneDigits],
    );
    return toRow(res.rows[0]);
  },

  async findByEmail(orgId, email) {
    const res = await tenantQuery<Record<string, unknown>>(
      orgId,
      `${CUSTOMER_SELECT}
        WHERE organization_id = $1
          AND email IS NOT NULL
          AND LOWER(email) = LOWER($2)
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [orgId, email],
    );
    return toRow(res.rows[0]);
  },

  async createCustomer(orgId, args) {
    const parts = args.name.trim().split(/\s+/).filter(Boolean);
    const res = await tenantQuery<Record<string, unknown>>(
      orgId,
      `INSERT INTO customers
         (organization_id, display_name, customer_name, first_name, last_name,
          email, phone, contact_type, status)
       VALUES ($1, $2, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), 'customer', 'active')
       RETURNING id, phone, email, display_name AS name`,
      [orgId, args.name, parts[0] ?? '', parts.slice(1).join(' '), args.email, args.phone],
    );
    const row = toRow(res.rows[0]);
    if (!row) throw new Error('customer insert returned no row');
    return row;
  },

  async mergeChannelRefs(orgId, customerId, refs) {
    await tenantQuery(
      orgId,
      `UPDATE customers
          SET channel_refs = COALESCE(channel_refs, '{}'::jsonb) || $3::jsonb,
              updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, customerId, JSON.stringify(refs)],
    );
  },

  async fillContactGaps(orgId, customerId, gaps) {
    // COALESCE(NULLIF(existing,''), new) — the existing value wins whenever it
    // is present. A channel order must never overwrite what a staff member
    // typed at the counter with the customer standing there.
    await tenantQuery(
      orgId,
      `UPDATE customers
          SET email        = COALESCE(NULLIF(email, ''),        NULLIF($3, '')),
              phone        = COALESCE(NULLIF(phone, ''),        NULLIF($4, '')),
              display_name = COALESCE(NULLIF(display_name, ''), NULLIF($5, '')),
              updated_at   = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, customerId, gaps.email ?? '', gaps.phone ?? '', gaps.name ?? ''],
    );
  },
};

/**
 * Find-or-create the buyer of `order`, and record the channel reference.
 *
 * `identityPhone` is the phone the two-key check already agreed with — passed
 * in rather than read off the order so the row this lands on is the SAME row
 * the counter's own phone lookup will find. Using the order's phone instead
 * would let a visit hydrate one customer and then bill a different one.
 */
export async function upsertCustomerFromChannelOrder(
  args: {
    orgId: OrgId;
    order: ChannelOrder;
    identityPhone: string;
    /** A name typed at the counter. Wins over the channel's, per plan X4. */
    typedName?: string | null;
  },
  deps: UpsertCustomerFromChannelOrderDeps = defaultUpsertChannelCustomerDeps,
): Promise<UpsertCustomerFromChannelOrderResult> {
  const { orgId, order } = args;
  const warnings: string[] = [];
  const identityDigits = lastDigits(args.identityPhone);
  const orderEmail = (order.email ?? '').trim();
  const orderName = (order.billing?.name ?? order.shipping?.name ?? '').trim();
  const typedName = (args.typedName ?? '').trim();
  const orderPhone = (order.phone ?? order.billing?.phone ?? '').trim();

  let customer = identityDigits.length >= 7
    ? await deps.findByPhoneDigits(orgId, identityDigits)
    : null;
  let matchedBy: ChannelCustomerMatch = 'phone';

  if (!customer && orderEmail) {
    customer = await deps.findByEmail(orgId, orderEmail);
    if (customer) matchedBy = 'email';
  }

  if (!customer) {
    const name = typedName || orderName;
    if (!name) {
      // Every other identity path in this feature refuses to create a person
      // with no name rather than minting "customer 5551234567". The channel
      // order almost always carries one; when it does not, the desk types it.
      throw new Error('The online order carries no buyer name — type one at the counter.');
    }
    customer = await deps.createCustomer(orgId, {
      name,
      phone: args.identityPhone.trim() || orderPhone,
      email: orderEmail,
    });
    matchedBy = 'created';
  } else {
    // Fill blanks only. An existing row's typed values are authoritative.
    await deps.fillContactGaps(orgId, customer.id, {
      email: orderEmail,
      phone: orderPhone,
      name: typedName || orderName,
    });
    if (!customer.storedEmail && orderEmail) customer = { ...customer, storedEmail: orderEmail };
    if (!customer.storedName && (typedName || orderName)) {
      customer = { ...customer, storedName: typedName || orderName };
    }
  }

  try {
    // The internal id, not the public number: the public number is the
    // customer's reference and is not guaranteed stable as a key.
    await deps.mergeChannelRefs(orgId, customer.id, { [order.provider]: order.id });
  } catch (err) {
    // A missing cross-reference is a reconciliation inconvenience. It is not a
    // reason to fail a visit with a customer standing at the counter.
    warnings.push('The online-store reference could not be linked to this customer.');
    console.error('[counter] channel_refs merge failed', err);
  }

  return { customer, matchedBy, warnings };
}
