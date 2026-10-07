/**
 * THE order-buyer resolver: every writer that links an order to a buyer
 * (canonical ingest, manual / assistant order create, staff buyer correction)
 * calls {@link resolveOrderBuyers}. Precedence, first wins:
 *   1. strong identity — channel customer id › email › phone (match, adopt by
 *      stamping the channel id, or create with everything the source knew);
 *   2. the customer already created for this order number (`customers.order_id`);
 *   3. the buyer's name (`customer_name` / `display_name`), else a new customer.
 * Batched: a fixed number of queries per tier regardless of batch size.
 */

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

/** A staff ship-to correction that outranks the incoming order: stamped at or
 * after `placedAtParam` (the source order's placed-at; NULL = unknown, kept). */
const STAFF_SHIP_TO_KEPT = (placedAtParam: string) =>
  `(shipping_edited_at IS NOT NULL AND (${placedAtParam}::timestamptz IS NULL OR shipping_edited_at >= ${placedAtParam}::timestamptz))`;

export type BuyerBlock = NonNullable<CanonicalOrderLine['buyer']>;

export interface BuyerEntry {
  accountSource: string;
  buyer: BuyerBlock;
  /** When the source order was placed — a staff ship-to correction newer than this is kept. */
  placedAt?: Date | null;
}

/** One order's buyer evidence for {@link resolveOrderBuyers}. */
export interface OrderBuyerRequest {
  /** Keys `buyer.channelCustomerId`: the system that issued it (an aggregator), else the order's source. */
  accountSource: string;
  /** The order's external number — a customer created for it carries it on `customers.order_id`. */
  orderNumber: string;
  /** Contact + ship-to the source carried; null for a name-only source (sheet / CSV buyer column). */
  buyer: BuyerBlock | null;
  /** Name-only evidence, read when `buyer` is null. */
  name: string;
  placedAt?: Date | null;
}

export interface ResolvedOrderBuyer {
  /** The linked customer; null when the request carried no buyer evidence at all. */
  customerId: number | null;
  /** True when this call created the customer row. */
  created: boolean;
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
function buyerIdentityKey(accountSource: string, buyer: BuyerBlock): string | null {
  const channelId = buyer.channelCustomerId.trim();
  if (channelId) return `id\u0000${accountSource}\u0000${channelId}`;
  const email = buyer.email.trim().toLowerCase();
  if (email) return `email\u0000${email}`;
  const digits = buyer.phone.replace(/\D/g, '');
  if (digits.length >= 10) return `phone\u0000${digits.slice(-10)}`;
  return null;
}

/**
 * Tier 1 — resolve + persist buyers by strong identity. Rows found by
 * email/phone are adopted (channel id stamped); genuinely-new buyers are
 * created with everything the source knew.
 */
async function resolveByIdentity(
  orgId: OrgId,
  buyers: readonly BuyerEntry[],
  deps: ResolveBuyerCustomersDeps,
): Promise<{ ids: Map<string, number>; created: Set<string> }> {
  const resolved = new Map<string, number>();
  const created = new Set<string>();
  const args = { orgId, buyers };

  // Collapse to unique buyers — LAST sighting wins: connectors emit in source
  // recency order (ShipStation lists by modifyDate ASC), so the final entry is
  // the buyer's most recent truth, and that is what refreshes the row below.
  const wanted = new Map<string, BuyerEntry>();
  for (const entry of args.buyers) {
    const key = buyerIdentityKey(entry.accountSource, entry.buyer);
    if (key) wanted.set(key, entry);
  }
  if (wanted.size === 0) return { ids: resolved, created };

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
    if (id != null) {
      resolved.set(key, id);
      created.add(key);
    }
  });

  return { ids: resolved, created };
}

/** Resolver deps that run inside the caller's transaction. */
export function buyerDepsInTx(client: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }): ResolveBuyerCustomersDeps {
  return { runQuery: async (_orgId, sql, params) => (await client.query(sql, params)) as never };
}

/** A buyer typed by staff (manual order, buyer correction) in the resolver's shape — no channel id. */
export function staffEnteredBuyer(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  shipTo?: { address1: string; address2?: string | null; city: string; state: string; postalCode: string; country: string } | null;
}): BuyerBlock {
  const s = input.shipTo;
  return {
    channelCustomerId: '',
    name: input.name.trim(),
    email: (input.email ?? '').trim(),
    phone: (input.phone ?? '').trim(),
    shipTo: s && (s.address1.trim() || s.city.trim())
      ? { address1: s.address1, address2: s.address2 || null, city: s.city, state: s.state, postalCode: s.postalCode, country: s.country, residential: null }
      : null,
  };
}

/** Match key for a buyer name — trimmed, case- and whitespace-insensitive. */
function customerNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** `customerNameKey` in SQL. */
const customerNameKeySql = (expr: string) => `lower(btrim(regexp_replace(${expr}, '\\s+', ' ', 'g')))`;

/**
 * Resolve every order's buyer — the one entry point (see the module doc for
 * the precedence). Returns one answer per request, same order.
 */
export async function resolveOrderBuyers(
  orgId: OrgId,
  requests: readonly OrderBuyerRequest[],
  deps: ResolveBuyerCustomersDeps = defaultDeps,
): Promise<ResolvedOrderBuyer[]> {
  const out: ResolvedOrderBuyer[] = requests.map(() => ({ customerId: null, created: false }));

  // ── 1. Strong identity ──────────────────────────────────────────────
  const keyOf = requests.map((r) => (r.buyer ? buyerIdentityKey(r.accountSource, r.buyer) : null));
  const strong = await resolveByIdentity(
    orgId,
    requests.flatMap((r, i) => (keyOf[i] ? [{ accountSource: r.accountSource, buyer: r.buyer!, placedAt: r.placedAt }] : [])),
    deps,
  );
  keyOf.forEach((key, i) => {
    const id = key ? strong.ids.get(key) : undefined;
    if (id != null) out[i] = { customerId: id, created: strong.created.has(key!) };
  });

  // ── 2. The buyer this order number already has ──────────────────────
  // Another line of the same order linked to a customer, else the customer
  // created for this number (`customers.order_id`).
  const open = () => out.flatMap((o, i) => (o.customerId == null && !keyOf[i] ? [i] : []));
  const numbers = [...new Set(open().map((i) => requests[i].orderNumber.trim()).filter(Boolean))];
  if (numbers.length > 0) {
    const rows = await deps.runQuery<{ id: number; order_id: string }>(
      orgId,
      `SELECT DISTINCT ON (order_id) id, order_id
         FROM (
           SELECT o.customer_id AS id, o.order_id, 0 AS rank, o.created_at
             FROM orders o
            WHERE o.organization_id = $2 AND o.order_id = ANY($1::text[]) AND o.customer_id IS NOT NULL
           UNION ALL
           SELECT c.id, c.order_id, 1 AS rank, c.created_at
             FROM customers c
            WHERE c.organization_id = $2 AND c.order_id = ANY($1::text[])
         ) known
        ORDER BY order_id, rank, created_at DESC, id DESC`,
      [numbers, orgId],
    );
    const byNumber = new Map(rows.rows.map((r) => [r.order_id, Number(r.id)]));
    for (const i of open()) {
      const id = byNumber.get(requests[i].orderNumber.trim());
      if (id != null) out[i] = { customerId: id, created: false };
    }
  }

  // ── 3. Name ─────────────────────────────────────────────────────────
  const named = open().flatMap((i) => {
    const name = (requests[i].buyer?.name ?? requests[i].name).trim();
    return name ? [{ i, name, key: customerNameKey(name) }] : [];
  });
  if (named.length === 0) return out;

  // Match on customer_name OR display_name, oldest first, so a new order joins
  // the established customer rather than a later copy.
  const nameKeyExpr = customerNameKeySql("COALESCE(NULLIF(btrim(customer_name), ''), display_name, '')");
  const existing = await deps.runQuery<{ id: number; match_key: string }>(
    orgId,
    `SELECT id, ${nameKeyExpr} AS match_key
       FROM customers
      WHERE organization_id = $2 AND ${nameKeyExpr} = ANY($1::text[])
      ORDER BY created_at ASC, id ASC`,
    [[...new Set(named.map((n) => n.key))], orgId],
  );
  const byName = new Map<string, number>();
  for (const row of existing.rows) if (!byName.has(row.match_key)) byName.set(row.match_key, Number(row.id));

  // A request with a buyer block (contact without email/phone, a ship-to)
  // refreshes or creates its row with all of it; a bare name is batch-created.
  const bareToCreate = new Map<string, { name: string; orderNumber: string }>();
  await forEachLimited(named, UPSERT_CONCURRENCY, async ({ i, name, key }) => {
    const r = requests[i];
    const matched = byName.get(key) ?? null;
    if (!r.buyer) {
      if (matched != null) out[i] = { customerId: matched, created: false };
      else if (!bareToCreate.has(key)) bareToCreate.set(key, { name, orderNumber: r.orderNumber.trim() });
      return;
    }
    const id = await upsertResolvedCustomer(orgId, matched, { accountSource: r.accountSource, buyer: r.buyer, placedAt: r.placedAt }, deps);
    if (id != null) out[i] = { customerId: id, created: matched == null };
  });

  if (bareToCreate.size > 0) {
    const values: unknown[] = [];
    const tuples = Array.from(bareToCreate.values(), ({ name, orderNumber }, n) => {
      const { first, last } = splitName(name);
      const b = n * 5;
      values.push(orgId, name, first, last, orderNumber || null);
      return `($${b + 1}, $${b + 2}, $${b + 2}, $${b + 3}, $${b + 4}, 'customer', $${b + 5}, now(), now())`;
    });
    const created = await deps.runQuery<{ id: number; match_key: string }>(
      orgId,
      `INSERT INTO customers (
         organization_id, customer_name, display_name, first_name, last_name,
         contact_type, order_id, created_at, updated_at
       ) VALUES ${tuples.join(', ')}
       RETURNING id, ${customerNameKeySql('customer_name')} AS match_key`,
      values,
    );
    const createdByKey = new Map(created.rows.map((row) => [row.match_key, Number(row.id)]));
    for (const { i, key } of named) {
      const id = out[i].customerId == null ? createdByKey.get(key) : undefined;
      if (id != null) out[i] = { customerId: id, created: true };
    }
  }
  return out;
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
    // source carries one (Amazon connector convention) — except a staff
    // correction (`shipping_edited_at`) made at or after this order was placed,
    // which a re-sync of that order must not revert. An overwrite by a newer
    // order clears the stamp: the stored address is the channel's again.
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
             shipping_address_1   = CASE WHEN ${STAFF_SHIP_TO_KEPT('$16')} THEN shipping_address_1   ELSE COALESCE($7,  shipping_address_1) END,
             shipping_address_2   = CASE WHEN ${STAFF_SHIP_TO_KEPT('$16')} THEN shipping_address_2   ELSE COALESCE($8,  shipping_address_2) END,
             shipping_city        = CASE WHEN ${STAFF_SHIP_TO_KEPT('$16')} THEN shipping_city        ELSE COALESCE($9,  shipping_city) END,
             shipping_state       = CASE WHEN ${STAFF_SHIP_TO_KEPT('$16')} THEN shipping_state       ELSE COALESCE($10, shipping_state) END,
             shipping_postal_code = CASE WHEN ${STAFF_SHIP_TO_KEPT('$16')} THEN shipping_postal_code ELSE COALESCE($11, shipping_postal_code) END,
             shipping_country     = CASE WHEN ${STAFF_SHIP_TO_KEPT('$16')} THEN shipping_country     ELSE COALESCE($12, shipping_country) END,
             shipping_edited_at   = CASE WHEN ${STAFF_SHIP_TO_KEPT('$16')} OR $7 IS NULL THEN shipping_edited_at ELSE NULL END,
             ${stampColumn} = COALESCE(${stampColumn}, $13),
             channel_refs = channel_refs || ($14::jsonb),
             billing_address = CASE
               WHEN $15::jsonb IS NOT NULL AND (billing_address IS NULL OR billing_address = '{}'::jsonb)
               THEN $15::jsonb ELSE billing_address END,
             updated_at = now()
           WHERE id = $1 AND organization_id = $17`
        : `UPDATE customers SET
             customer_name = COALESCE(NULLIF($2, ''), customer_name),
             display_name  = COALESCE(NULLIF($2, ''), display_name),
             first_name    = COALESCE(NULLIF($3, ''), first_name),
             last_name     = COALESCE(NULLIF($4, ''), last_name),
             phone         = COALESCE(NULLIF($5, ''), phone),
             email         = COALESCE(NULLIF($6, ''), email),
             shipping_address_1   = CASE WHEN ${STAFF_SHIP_TO_KEPT('$15')} THEN shipping_address_1   ELSE COALESCE($7,  shipping_address_1) END,
             shipping_address_2   = CASE WHEN ${STAFF_SHIP_TO_KEPT('$15')} THEN shipping_address_2   ELSE COALESCE($8,  shipping_address_2) END,
             shipping_city        = CASE WHEN ${STAFF_SHIP_TO_KEPT('$15')} THEN shipping_city        ELSE COALESCE($9,  shipping_city) END,
             shipping_state       = CASE WHEN ${STAFF_SHIP_TO_KEPT('$15')} THEN shipping_state       ELSE COALESCE($10, shipping_state) END,
             shipping_postal_code = CASE WHEN ${STAFF_SHIP_TO_KEPT('$15')} THEN shipping_postal_code ELSE COALESCE($11, shipping_postal_code) END,
             shipping_country     = CASE WHEN ${STAFF_SHIP_TO_KEPT('$15')} THEN shipping_country     ELSE COALESCE($12, shipping_country) END,
             shipping_edited_at   = CASE WHEN ${STAFF_SHIP_TO_KEPT('$15')} OR $7 IS NULL THEN shipping_edited_at ELSE NULL END,
             channel_refs = channel_refs || ($13::jsonb),
             billing_address = CASE
               WHEN $14::jsonb IS NOT NULL AND (billing_address IS NULL OR billing_address = '{}'::jsonb)
               THEN $14::jsonb ELSE billing_address END,
             updated_at = now()
           WHERE id = $1 AND organization_id = $16`,
      stampColumn
        ? [
            customerId, name, first, last, buyer.phone.trim(), buyer.email.trim(),
            shipTo?.address1 ?? null, shipTo?.address2 ?? null, shipTo?.city ?? null,
            shipTo?.state ?? null, shipTo?.postalCode ?? null, shipTo?.country ?? null,
            channelId, channelRefs, billingAddress, entry.placedAt ?? null, orgId,
          ]
        : [
            customerId, name, first, last, buyer.phone.trim(), buyer.email.trim(),
            shipTo?.address1 ?? null, shipTo?.address2 ?? null, shipTo?.city ?? null,
            shipTo?.state ?? null, shipTo?.postalCode ?? null, shipTo?.country ?? null,
            channelRefs, billingAddress, entry.placedAt ?? null, orgId,
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
