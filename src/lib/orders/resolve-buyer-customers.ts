/** Resolve canonical BUYER identities (channel id / email / phone) to real `customers` rows — match-then-stamp-then-create, batched. */

import type { CanonicalOrderLine } from './canonical-order';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

/** Channels that carry a stable customer id → the customers column holding it. */
const CHANNEL_IDENTITY_COLUMNS: Record<string, string> = {
  shipstation: 'shipstation_customer_id',
  // Ecwid's `order.customerId` — the storefront account, stable across a buyer changing their email or phone, which is exactly why it…
  ecwid: 'ecwid_customer_id',
};

/** The phone-match expression. MUST stay byte-identical to the functional
 * indexes (idx_customers_phone_last10 / idx_customers_mobile_last10) or the
 * planner falls back to a seq scan per lookup. */
const last10Sql = (col: string) =>
  `right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10)`;

export type BuyerBlock = NonNullable<CanonicalOrderLine['buyer']>;

export interface BuyerEntry {
  accountSource: string;
  buyer: BuyerBlock;
}

interface ResolveBuyerCustomersArgs {
  /** Buyers to resolve, one per canonical order (duplicates collapsed here). */
  buyers: BuyerEntry[];
  orgId: OrgId;
}

export interface ResolveBuyerCustomersDeps {
  /** Tenant-scoped query: `(orgId, sql, params)` → `{ rows }`. The org rides
   * the dep so the default can bind the tenant GUC without closure state. */
  runQuery: <T extends Record<string, unknown>>(
    orgId: OrgId,
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: T[] }>;
}

const defaultDeps: ResolveBuyerCustomersDeps = {
  runQuery: (orgId, sql, params) => tenantQuery(orgId, sql, params),
};

/**
 * The stable identity key for a buyer WITHIN a batch: the channel id when the
 * source carries one, else the email, else the phone's last 10 digits. `null`
 * when the buyer has none of those — the caller drops it to the name tier.
 */
export function buyerIdentityKey(accountSource: string, buyer: BuyerBlock): string | null {
  const channelId = buyer.channelCustomerId.trim();
  if (channelId) return `id\u0000${accountSource}\u0000${channelId}`;
  const email = buyer.email.trim().toLowerCase();
  if (email) return `email\u0000${email}`;
  const digits = buyer.phone.replace(/\D/g, '');
  if (digits.length >= 10) return `phone\u0000${digits.slice(-10)}`;
  return null;
}

/**
 * Resolve + persist buyers. Returns customerId keyed by `buyerIdentityKey`.
 * Rows found by email/phone are adopted (channel id stamped); genuinely-new
 * buyers are created with everything the source knew.
 */
export async function resolveBuyerCustomers(
  args: ResolveBuyerCustomersArgs,
  deps: ResolveBuyerCustomersDeps = defaultDeps,
): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();

  // Collapse to unique buyers — LAST sighting wins: connectors emit in source
  // recency order (ShipStation lists by modifyDate ASC), so the final entry is
  // the buyer's most recent truth, and that is what refreshes the row below.
  const wanted = new Map<string, BuyerEntry>();
  for (const entry of args.buyers) {
    const key = buyerIdentityKey(entry.accountSource, entry.buyer);
    if (key) wanted.set(key, entry);
  }
  if (wanted.size === 0) return resolved;

  const pending = new Map(wanted);

  // ── Tier 1: channel customer id (exact), per channel column ─────────
  for (const [accountSource, column] of Object.entries(CHANNEL_IDENTITY_COLUMNS)) {
    const ids = Array.from(
      new Set(
        Array.from(pending.values())
          .filter((e) => e.accountSource === accountSource && e.buyer.channelCustomerId.trim())
          .map((e) => e.buyer.channelCustomerId.trim()),
      ),
    );
    if (ids.length === 0) continue;
    const rows = await deps.runQuery<{ id: number; channel_id: string }>(
      args.orgId,
      `SELECT id, ${column} AS channel_id
         FROM customers
        WHERE organization_id = $2 AND ${column} = ANY($1::text[])
        ORDER BY created_at ASC, id ASC`,
      [ids, args.orgId],
    );
    for (const row of rows.rows) {
      const key = `id\u0000${accountSource}\u0000${String(row.channel_id)}`;
      if (!resolved.has(key)) resolved.set(key, Number(row.id));
    }
  }
  for (const key of Array.from(resolved.keys())) pending.delete(key);

  // ── Tier 2: email (exact, case-insensitive) ──────────────────────────
  const emailEntries = Array.from(pending.entries()).filter(([, e]) => e.buyer.email.trim());
  if (emailEntries.length > 0) {
    const rows = await deps.runQuery<{ id: number; email: string }>(
      args.orgId,
      `SELECT id, lower(email) AS email
         FROM customers
        WHERE organization_id = $2 AND lower(email) = ANY($1::text[])
        ORDER BY created_at ASC, id ASC`,
      [emailEntries.map(([, e]) => e.buyer.email.trim().toLowerCase()), args.orgId],
    );
    const idByEmail = new Map<string, number>();
    for (const row of rows.rows) {
      if (!idByEmail.has(row.email)) idByEmail.set(row.email, Number(row.id));
    }
    for (const [key, entry] of emailEntries) {
      const id = idByEmail.get(entry.buyer.email.trim().toLowerCase());
      if (id != null) {
        resolved.set(key, id);
        pending.delete(key);
      }
    }
  }

  // ── Tier 3: phone (last 10 digits) ───────────────────────────────────
  const phoneEntries = Array.from(pending.entries()).filter(
    ([, e]) => e.buyer.phone.replace(/\D/g, '').length >= 10,
  );
  if (phoneEntries.length > 0) {
    const last10s = phoneEntries.map(([, e]) => e.buyer.phone.replace(/\D/g, '').slice(-10));
    const rows = await deps.runQuery<{ id: number; phone10: string; mobile10: string | null }>(
      args.orgId,
      `SELECT id, ${last10Sql('phone')} AS phone10, ${last10Sql('mobile')} AS mobile10
         FROM customers
        WHERE organization_id = $2
          AND (${last10Sql('phone')} = ANY($1::text[]) OR ${last10Sql('mobile')} = ANY($1::text[]))
        ORDER BY created_at ASC, id ASC`,
      [last10s, args.orgId],
    );
    const idBy10 = new Map<string, number>();
    for (const row of rows.rows) {
      for (const ten of [row.phone10, row.mobile10]) {
        if (ten && !idBy10.has(ten)) idBy10.set(ten, Number(row.id));
      }
    }
    for (const [key, entry] of phoneEntries) {
      const id = idBy10.get(entry.buyer.phone.replace(/\D/g, '').slice(-10));
      if (id != null) {
        resolved.set(key, id);
        pending.delete(key);
      }
    }
  }

  // Each entry is a distinct identity key, so the writes are independent; run them a few at a time instead of one round trip after another…
  await forEachLimited(Array.from(resolved), UPSERT_CONCURRENCY, async ([key, customerId]) => {
    const entry = wanted.get(key);
    if (entry) await upsertResolvedCustomer(args.orgId, customerId, entry, deps);
  });

  // ── Create genuinely-new buyers ──────────────────────────────────────
  await forEachLimited(Array.from(pending), UPSERT_CONCURRENCY, async ([key, entry]) => {
    const id = await upsertResolvedCustomer(args.orgId, null, entry, deps);
    if (id != null) resolved.set(key, id);
  });

  return resolved;
}

const UPSERT_CONCURRENCY = 8;

async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.length > 1 ? parts.slice(1).join(' ') : '' };
}

/**
 * Refresh an existing row / create a new one. Two static SQL shapes (with and
 * without the channel-id column) — dynamic placeholder juggling is how bind
 * counts drift from param arrays.
 */
async function upsertResolvedCustomer(
  orgId: OrgId,
  customerId: number | null,
  entry: BuyerEntry,
  deps: ResolveBuyerCustomersDeps,
): Promise<number | null> {
  const { accountSource, buyer } = entry;
  const column = CHANNEL_IDENTITY_COLUMNS[accountSource];
  const channelId = buyer.channelCustomerId.trim();
  // Stamp only when this source actually carries its id.
  const stampColumn = column && channelId ? column : null;
  const { first, last } = splitName(buyer.name);
  const name = buyer.name.trim();
  const shipTo = buyer.shipTo;
  const channelRefs = JSON.stringify(
    stampColumn ? { [`${accountSource}_customer_id`]: channelId } : {},
  );
  // Bill-to lands on `customers.billing_address` only while that is blank.
  const billingAddress = buyer.billTo ? JSON.stringify(buyer.billTo) : null;

  if (customerId != null) {
    // Names/phone/email fill blanks only; the address is overwritten when the
    // source carries one (Amazon connector convention).
    await deps.runQuery(
      orgId,
      stampColumn
        ? `UPDATE customers SET
             customer_name = COALESCE(NULLIF($2, ''), customer_name),
             display_name  = COALESCE(NULLIF($2, ''), display_name),
             first_name    = COALESCE(NULLIF($3, ''), first_name),
             last_name     = COALESCE(NULLIF($4, ''), last_name),
             phone         = COALESCE(NULLIF($5, ''), phone),
             email         = COALESCE(NULLIF($6, ''), email),
             shipping_address_1   = COALESCE($7,  shipping_address_1),
             shipping_address_2   = COALESCE($8,  shipping_address_2),
             shipping_city        = COALESCE($9,  shipping_city),
             shipping_state       = COALESCE($10, shipping_state),
             shipping_postal_code = COALESCE($11, shipping_postal_code),
             shipping_country     = COALESCE($12, shipping_country),
             ${stampColumn} = COALESCE(${stampColumn}, $13),
             channel_refs = channel_refs || ($14::jsonb),
             billing_address = CASE
               WHEN $15::jsonb IS NOT NULL AND (billing_address IS NULL OR billing_address = '{}'::jsonb)
               THEN $15::jsonb ELSE billing_address END,
             updated_at = now()
           WHERE id = $1 AND organization_id = $16`
        : `UPDATE customers SET
             customer_name = COALESCE(NULLIF($2, ''), customer_name),
             display_name  = COALESCE(NULLIF($2, ''), display_name),
             first_name    = COALESCE(NULLIF($3, ''), first_name),
             last_name     = COALESCE(NULLIF($4, ''), last_name),
             phone         = COALESCE(NULLIF($5, ''), phone),
             email         = COALESCE(NULLIF($6, ''), email),
             shipping_address_1   = COALESCE($7,  shipping_address_1),
             shipping_address_2   = COALESCE($8,  shipping_address_2),
             shipping_city        = COALESCE($9,  shipping_city),
             shipping_state       = COALESCE($10, shipping_state),
             shipping_postal_code = COALESCE($11, shipping_postal_code),
             shipping_country     = COALESCE($12, shipping_country),
             channel_refs = channel_refs || ($13::jsonb),
             billing_address = CASE
               WHEN $14::jsonb IS NOT NULL AND (billing_address IS NULL OR billing_address = '{}'::jsonb)
               THEN $14::jsonb ELSE billing_address END,
             updated_at = now()
           WHERE id = $1 AND organization_id = $15`,
      stampColumn
        ? [
            customerId, name, first, last, buyer.phone.trim(), buyer.email.trim(),
            shipTo?.address1 ?? null, shipTo?.address2 ?? null, shipTo?.city ?? null,
            shipTo?.state ?? null, shipTo?.postalCode ?? null, shipTo?.country ?? null,
            channelId, channelRefs, billingAddress, orgId,
          ]
        : [
            customerId, name, first, last, buyer.phone.trim(), buyer.email.trim(),
            shipTo?.address1 ?? null, shipTo?.address2 ?? null, shipTo?.city ?? null,
            shipTo?.state ?? null, shipTo?.postalCode ?? null, shipTo?.country ?? null,
            channelRefs, billingAddress, orgId,
          ],
    );
    return customerId;
  }
  const inserted = await deps.runQuery<{ id: number }>(
    orgId,
    stampColumn
      ? `INSERT INTO customers (
           organization_id, customer_name, display_name, first_name, last_name,
           phone, email, shipping_address_1, shipping_address_2, shipping_city,
           shipping_state, shipping_postal_code, shipping_country,
           contact_type, ${stampColumn}, channel_refs, billing_address, created_at, updated_at
         ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'customer', $13, $15::jsonb,
                   COALESCE($14::jsonb, '{}'::jsonb), now(), now())
         ON CONFLICT DO NOTHING
         RETURNING id`
      : `INSERT INTO customers (
           organization_id, customer_name, display_name, first_name, last_name,
           phone, email, shipping_address_1, shipping_address_2, shipping_city,
           shipping_state, shipping_postal_code, shipping_country,
           contact_type, channel_refs, billing_address, created_at, updated_at
         ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'customer', $14::jsonb,
                   COALESCE($13::jsonb, '{}'::jsonb), now(), now())
         ON CONFLICT DO NOTHING
         RETURNING id`,
    stampColumn
      ? [
          orgId, name || 'Unknown', first, last, buyer.phone.trim() || null,
          buyer.email.trim() || null, shipTo?.address1 ?? null, shipTo?.address2 ?? null,
          shipTo?.city ?? null, shipTo?.state ?? null, shipTo?.postalCode ?? null,
          shipTo?.country ?? null, channelId, billingAddress, channelRefs,
        ]
      : [
          orgId, name || 'Unknown', first, last, buyer.phone.trim() || null,
          buyer.email.trim() || null, shipTo?.address1 ?? null, shipTo?.address2 ?? null,
          shipTo?.city ?? null, shipTo?.state ?? null, shipTo?.postalCode ?? null,
          shipTo?.country ?? null, billingAddress, channelRefs,
        ],
  );
  // NULL row = a constraint race (e.g. the unique channel-id index lost to a
  // concurrent sync). Left unresolved on purpose — the next run's tier-1
  // match finds the winner; inventing a second row here would defeat dedupe.
  const id = inserted.rows[0]?.id;
  return id != null ? Number(id) : null;
}
