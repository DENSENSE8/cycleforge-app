import pool from '../db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface CustomerRecord {
  id: number;
  customer_name: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
  entity_type: string | null;
  entity_id: number | null;
}

export interface CustomerLookupRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  updated_at: string | null;
}

/**
 * Find-or-create the `customers` row behind a PROVIDER contact (Ecwid today).
 *
 * Callers: `upsertEcwidIncomingRepair`. Schemas: `customers` (read + insert).
 * User 2026-09-23: *"there is already a customers table for the API
 * integration — it should import the repair service and the customers into the
 * customers table and display correctly within the receipt page."*
 *
 * ## Why not `findOrCreateRepairCustomer`
 *
 * That helper matches phone → **name** → create, and `04-unified-route.md` §
 * already rules that a bare NAME match silently merges two different "John
 * Smith"s onto one record. A sync runs unattended over every order in the
 * store, so it is the LAST place that hazard should be widened. This matches
 * on keys only:
 *
 *   1. phone, by the repo's canonical NANP last-ten key — the same expression
 *      `resolve-buyer-customers.ts`, `submit-counter-transaction.ts` and the
 *      `idx_customers_phone_last10` index use, so a hit here is a hit there;
 *   2. email, lower-cased exact;
 *   3. otherwise create.
 *
 * Null when the contact carries neither a phone nor an email: a row with a name
 * and nothing else is not an identity, it is a label, and minting one per sync
 * pass would fill the book with duplicates nothing can ever match again.
 */
export async function resolveProviderCustomerId(
  orgId: OrgId,
  contact: { name?: string | null; phone?: string | null; email?: string | null },
): Promise<number | null> {
  const phoneDigits = String(contact.phone ?? '').replace(/\D/g, '').slice(-10);
  const email = String(contact.email ?? '').trim().toLowerCase();
  const name = String(contact.name ?? '').trim();
  if (!phoneDigits && !email) return null;

  const existing = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT id
       FROM customers
      WHERE organization_id = $1
        AND (
          ($2 <> '' AND (
            RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2
            OR RIGHT(REGEXP_REPLACE(COALESCE(mobile, ''), '\\D', '', 'g'), 10) = $2
          ))
          OR ($3 <> '' AND LOWER(COALESCE(email, '')) = $3)
        )
      ORDER BY id ASC
      LIMIT 1`,
    [orgId, phoneDigits, email],
  );
  const found = existing.rows[0];
  if (found) return Number(found.id);

  const created = await createRepairCustomer(
    { name: name || email || contact.phone || '', phone: contact.phone ?? '', email: email || undefined },
    orgId,
  );
  return Number(created.id);
}

/**
 * Find a customer by phone number.
 */
export async function findCustomerByPhone(phone: string, orgId?: OrgId): Promise<CustomerRecord | null> {
  if (orgId) {
    const result = await tenantQuery<CustomerRecord>(
      orgId,
      `SELECT id, customer_name, display_name, first_name, last_name, email, phone,
              contact_type, entity_type, entity_id
       FROM customers
       WHERE phone = $1 AND organization_id = $2
       LIMIT 1`,
      [phone, orgId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
  const result = await pool.query(
    `SELECT id, customer_name, display_name, first_name, last_name, email, phone,
            contact_type, entity_type, entity_id
     FROM customers
     WHERE phone = $1
     LIMIT 1`,
    [phone],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Find a customer by name (customer_name or display_name).
 */
export async function findCustomerByName(name: string, orgId?: OrgId): Promise<CustomerRecord | null> {
  if (orgId) {
    const result = await tenantQuery<CustomerRecord>(
      orgId,
      `SELECT id, customer_name, display_name, first_name, last_name, email, phone,
              contact_type, entity_type, entity_id
       FROM customers
       WHERE (customer_name = $1 OR display_name = $1) AND organization_id = $2
       LIMIT 1`,
      [name, orgId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
  const result = await pool.query(
    `SELECT id, customer_name, display_name, first_name, last_name, email, phone,
            contact_type, entity_type, entity_id
     FROM customers
     WHERE customer_name = $1 OR display_name = $1
     LIMIT 1`,
    [name],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Create a customer linked to a repair service entity.
 */
export async function createRepairCustomer(params: {
  name: string;
  phone: string;
  email?: string;
  /** Callers: submitCounterTransaction.createCustomer. Schema: customers.shipping_address_1. User: "intake their information like name, email address, phone number, address" */
  address?: string;
  repairId?: number;
}, orgId?: OrgId): Promise<CustomerRecord> {
  const parts = params.name.trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';

  if (orgId) {
    return withTenantTransaction(orgId, async (client) => {
      const result = await client.query<CustomerRecord>(
        `INSERT INTO customers (
          customer_name, display_name, first_name, last_name,
          phone, email, shipping_address_1, contact_type, entity_type, entity_id,
          organization_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'repair_customer', $8, $9, $10, NOW(), NOW())
        RETURNING id, customer_name, display_name, first_name, last_name, email, phone,
                  contact_type, entity_type, entity_id`,
        [
          params.name,
          params.name,
          firstName,
          lastName,
          params.phone || null,
          params.email || null,
          params.address?.trim() || null,
          params.repairId ? 'REPAIR' : null,
          params.repairId ?? null,
          orgId,
        ],
      );
      return result.rows[0];
    });
  }

  const result = await pool.query(
    `INSERT INTO customers (
      customer_name, display_name, first_name, last_name,
      phone, email, contact_type, entity_type, entity_id,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'repair_customer', $7, $8, NOW(), NOW())
    RETURNING id, customer_name, display_name, first_name, last_name, email, phone,
              contact_type, entity_type, entity_id`,
    [
      params.name,
      params.name,
      firstName,
      lastName,
      params.phone || null,
      params.email || null,
      params.repairId ? 'REPAIR' : null,
      params.repairId ?? null,
    ],
  );
  return result.rows[0];
}

/**
 * Update customer entity_id after repair is created.
 */
export async function linkCustomerToRepair(customerId: number, repairId: number, orgId?: OrgId): Promise<void> {
  if (orgId) {
    await withTenantTransaction(orgId, async (client) => {
      await client.query(
        `UPDATE customers
         SET entity_type = 'REPAIR', entity_id = $1, updated_at = NOW()
         WHERE id = $2 AND entity_id IS NULL AND organization_id = $3`,
        [repairId, customerId, orgId],
      );
    });
    return;
  }
  await pool.query(
    `UPDATE customers
     SET entity_type = 'REPAIR', entity_id = $1, updated_at = NOW()
     WHERE id = $2 AND entity_id IS NULL`,
    [repairId, customerId],
  );
}

/**
 * Find or create a customer for a repair intake.
 * Matches by phone first, then by name. Creates if not found.
 */
export async function findOrCreateRepairCustomer(params: {
  name: string;
  phone: string;
  email?: string;
}, orgId?: OrgId): Promise<CustomerRecord> {
  // Try phone match first
  if (params.phone) {
    const byPhone = await findCustomerByPhone(params.phone, orgId);
    if (byPhone) return byPhone;
  }

  // Try name match
  if (params.name) {
    const byName = await findCustomerByName(params.name, orgId);
    if (byName) return byName;
  }

  // Create new
  return createRepairCustomer(params, orgId);
}

/**
 * Lookup customers for repair intake "add existing customer".
 * If query is blank, returns most recently updated customers.
 */
export async function searchRepairCustomers(query: string, limit = 20, orgId?: OrgId): Promise<CustomerLookupRecord[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Number(limit))) : 20;
  const normalized = String(query || '').trim();

  const result = orgId
    ? normalized
      ? await tenantQuery(
          orgId,
          `SELECT
             id,
             COALESCE(NULLIF(display_name, ''), NULLIF(customer_name, ''), CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(last_name, '')), 'Unknown') AS name,
             NULLIF(phone, '') AS phone,
             NULLIF(email, '') AS email,
             updated_at::text AS updated_at
           FROM customers
           WHERE
             organization_id = $3
             AND (
               COALESCE(display_name, '') ILIKE $1
               OR COALESCE(customer_name, '') ILIKE $1
               OR COALESCE(first_name, '') ILIKE $1
               OR COALESCE(last_name, '') ILIKE $1
               OR COALESCE(phone, '') ILIKE $1
               OR COALESCE(email, '') ILIKE $1
             )
           ORDER BY updated_at DESC NULLS LAST, id DESC
           LIMIT $2`,
          [`%${normalized}%`, safeLimit, orgId],
        )
      : await tenantQuery(
          orgId,
          `SELECT
             id,
             COALESCE(NULLIF(display_name, ''), NULLIF(customer_name, ''), CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(last_name, '')), 'Unknown') AS name,
             NULLIF(phone, '') AS phone,
             NULLIF(email, '') AS email,
             updated_at::text AS updated_at
           FROM customers
           WHERE organization_id = $2
           ORDER BY updated_at DESC NULLS LAST, id DESC
           LIMIT $1`,
          [safeLimit, orgId],
        )
    : normalized
    ? await pool.query(
        `SELECT
           id,
           COALESCE(NULLIF(display_name, ''), NULLIF(customer_name, ''), CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(last_name, '')), 'Unknown') AS name,
           NULLIF(phone, '') AS phone,
           NULLIF(email, '') AS email,
           updated_at::text AS updated_at
         FROM customers
         WHERE
           COALESCE(display_name, '') ILIKE $1
           OR COALESCE(customer_name, '') ILIKE $1
           OR COALESCE(first_name, '') ILIKE $1
           OR COALESCE(last_name, '') ILIKE $1
           OR COALESCE(phone, '') ILIKE $1
           OR COALESCE(email, '') ILIKE $1
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT $2`,
        [`%${normalized}%`, safeLimit],
      )
    : await pool.query(
        `SELECT
           id,
           COALESCE(NULLIF(display_name, ''), NULLIF(customer_name, ''), CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(last_name, '')), 'Unknown') AS name,
           NULLIF(phone, '') AS phone,
           NULLIF(email, '') AS email,
           updated_at::text AS updated_at
         FROM customers
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT $1`,
        [safeLimit],
      );

  return result.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || 'Unknown'),
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  }));
}

export interface CustomerSearchResult {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  shippingAddress: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  shipstationCustomerId: string | null;
  /** The customer's most recent order, if any. */
  lastOrder: {
    id: number;
    orderRef: string | null;
    title: string | null;
    status: string | null;
    orderDate: string | null;
    /** As-shipped address snapshot from the latest label's STN metadata. */
    lastShipTo: Record<string, unknown> | null;
  } | null;
}

/**
 * Operator customer search ("customer calls back — find them"): name (trgm
 * ILIKE on the canonical name expressions), email, or phone. Phone queries
 * with ≥10 digits match on the last 10 digits (the caller-match rule), so a
 * typed "(415) 555-0100" finds a "+14155550100" record.
 *
 * Each hit carries the stored shipping address AND the last order + the
 * as-shipped address snapshot from its latest label — the two facts a
 * return/replacement label needs without asking the customer anything.
 *
 * Tenant-native: `orgId` is required (unlike the legacy helpers above, this
 * has no dogfood-pool fallback).
 */
export async function searchCustomers(
  query: string,
  orgId: OrgId,
  limit = 20,
): Promise<CustomerSearchResult[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Number(limit))) : 20;
  const normalized = String(query || '').trim();
  if (!normalized) return [];

  const digits = normalized.replace(/\D/g, '');
  const last10 = digits.length >= 10 ? digits.slice(-10) : null;
  const like = `%${normalized}%`;

  const { rows } = await tenantQuery(
    orgId,
    `SELECT
       c.id,
       COALESCE(NULLIF(btrim(c.customer_name), ''), c.display_name,
                NULLIF(btrim(CONCAT_WS(' ', NULLIF(c.first_name, ''), NULLIF(c.last_name, ''))), ''),
                'Unknown') AS name,
       NULLIF(c.phone, '') AS phone,
       NULLIF(c.email, '') AS email,
       NULLIF(c.shipping_address_1, '') AS addr1,
       NULLIF(c.shipping_address_2, '') AS addr2,
       NULLIF(c.shipping_city, '')      AS city,
       NULLIF(c.shipping_state, '')     AS state,
       NULLIF(c.shipping_postal_code, '') AS postal,
       NULLIF(c.shipping_country, '')   AS country,
       c.shipstation_customer_id,
       o.id            AS last_order_id,
       o.order_id      AS last_order_ref,
       o.product_title AS last_order_title,
       o.status        AS last_order_status,
       o.order_date::text AS last_order_date,
       stn.metadata->'ship_to' AS last_ship_to
     FROM customers c
     LEFT JOIN LATERAL (
       SELECT id, order_id, product_title, status, order_date, shipment_id
         FROM orders
        WHERE customer_id = c.id AND organization_id = $3
        ORDER BY order_date DESC NULLS LAST, id DESC
        LIMIT 1
     ) o ON TRUE
     LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
    WHERE c.organization_id = $3
      AND (
        COALESCE(NULLIF(btrim(c.customer_name), ''), c.display_name, '') ILIKE $1
        -- Immutable twin of idx_customers_fullname_trgm (CONCAT_WS is STABLE,
        -- so the index — and this predicate — use the COALESCE || form).
        OR NULLIF(btrim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') ILIKE $1
        OR lower(c.email) LIKE lower($1)
        OR c.phone ILIKE $1
        OR ($2::text IS NOT NULL AND (
              right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 10) = $2
           OR right(regexp_replace(coalesce(c.mobile, ''), '\\D', '', 'g'), 10) = $2))
      )
    ORDER BY o.order_date DESC NULLS LAST, c.updated_at DESC NULLS LAST, c.id DESC
    LIMIT $4`,
    [like, last10, orgId, safeLimit],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || 'Unknown'),
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    shippingAddress: {
      address1: row.addr1 ?? null,
      address2: row.addr2 ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      postalCode: row.postal ?? null,
      country: row.country ?? null,
    },
    shipstationCustomerId: row.shipstation_customer_id ? String(row.shipstation_customer_id) : null,
    lastOrder: row.last_order_id
      ? {
          id: Number(row.last_order_id),
          orderRef: row.last_order_ref ?? null,
          title: row.last_order_title ?? null,
          status: row.last_order_status ?? null,
          orderDate: row.last_order_date ?? null,
          lastShipTo: (row.last_ship_to as Record<string, unknown> | null) ?? null,
        }
      : null,
  }));
}
