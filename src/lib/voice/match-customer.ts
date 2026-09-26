/** Best-effort caller → customer match for inbound calls / voicemails. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { MatchedCustomer } from './types';
import { lastDigits } from './normalize-phone';

export interface MatchCustomerArgs {
  orgId: OrgId;
  /** Normalized E.164 (preferred) … */
  e164: string | null;
  /** … or the raw provider number, used when normalization failed. */
  rawNumber?: string | null;
}

export interface MatchCustomerDeps {
  /** Org-scoped `customers` lookup by last-10 digits (phone or mobile). */
  lookupCustomers: (orgId: OrgId, last10: string) => Promise<MatchedCustomer | null>;
  /** Square POS lookup by last-10 digits (table not yet org-scoped — see note). */
  lookupSquare: (orgId: OrgId, last10: string) => Promise<MatchedCustomer | null>;
}

const last10Sql = (col: string) =>
  `right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10)`;

const defaultDeps: MatchCustomerDeps = {
  async lookupCustomers(orgId, last10) {
    try {
      const r = await tenantQuery<{ name: string | null; email: string | null; phone: string | null }>(
        orgId,
        `SELECT COALESCE(display_name, customer_name, NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')) AS name,
                email,
                COALESCE(phone, mobile) AS phone
           FROM customers
          WHERE organization_id = $1
            AND (${last10Sql('phone')} = $2 OR ${last10Sql('mobile')} = $2)
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1`,
        [orgId, last10],
      );
      const row = r.rows[0];
      return row ? { name: row.name, email: row.email, phone: row.phone, source: 'customers' } : null;
    } catch {
      return null;
    }
  },
  async lookupSquare(orgId, last10) {
    try {
      // Explicit org predicate, not just the GUC: the app pool connects as a
      // BYPASSRLS role, so square_transactions' FORCE policy does not constrain
      // this read on its own (see square-transaction-queries.ts).
      const r = await tenantQuery<{ name: string | null; email: string | null; phone: string | null }>(
        orgId,
        `SELECT customer_name AS name, customer_email AS email, customer_phone AS phone
           FROM square_transactions
          WHERE organization_id = $1
            AND customer_phone IS NOT NULL
            AND ${last10Sql('customer_phone')} = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [orgId, last10],
      );
      const row = r.rows[0];
      return row ? { name: row.name, email: row.email, phone: row.phone, source: 'square' } : null;
    } catch {
      return null;
    }
  },
};

export async function matchCustomer(
  args: MatchCustomerArgs,
  deps: MatchCustomerDeps = defaultDeps,
): Promise<MatchedCustomer | null> {
  const last10 = lastDigits(args.e164 ?? args.rawNumber ?? '', 10);
  if (last10.length < 10) return null; // too few digits to match confidently

  // Org-scoped customers first (authoritative), then Square POS.
  const fromCustomers = await deps.lookupCustomers(args.orgId, last10);
  if (fromCustomers?.name) return fromCustomers;

  const fromSquare = await deps.lookupSquare(args.orgId, last10);
  if (fromSquare?.name) return fromSquare;

  return fromCustomers ?? fromSquare ?? null;
}
