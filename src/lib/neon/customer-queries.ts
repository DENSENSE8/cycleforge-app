import type { PoolClient } from 'pg';
import pool from '../db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  customerContactColumns,
  splitCustomerName,
  type CustomerContactColumns,
  type CustomerContactPatch,
  type CustomerCreate,
  type CustomerShipTo,
  type RepairCustomerCreate,
} from '@/lib/schemas/customers';

interface CustomerRecord {
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

interface CustomerLookupRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  updated_at: string | null;
}

/** Anything with pg's `query` — a tenant transaction's client, or a test fake. */
type CustomerDb = Pick<PoolClient, 'query'>;

/**
 * The contact that identifies a person, as a WHERE fragment over `customers`:
 * last-10 phone/mobile digits (`phoneParam`, '' = none), or email
 * (`emailParam`, lowercased, '' = none).
 */
export function customerContactMatchSql(phoneParam: string, emailParam: string): string {
  return `(
          (${phoneParam} <> '' AND (
            RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = ${phoneParam}
            OR RIGHT(REGEXP_REPLACE(COALESCE(mobile, ''), '\\D', '', 'g'), 10) = ${phoneParam}
          ))
          OR (${emailParam} <> '' AND LOWER(COALESCE(email, '')) = ${emailParam})
        )`;
}

/** Last-10 phone digits and lowercased email — the params `customerContactMatchSql` compares. */
export function customerContactKeys(contact: { phone?: string | null; email?: string | null }): { phoneDigits: string; email: string } {
  return {
    phoneDigits: String(contact.phone ?? '').replace(/\D/g, '').slice(-10),
    email: String(contact.email ?? '').trim().toLowerCase(),
  };
}

/**
 * A customer by the contact that identifies a person: last-10 phone/mobile
 * digits (`$2`), or email (`$3`, lowercased). Carries the display name and
 * stored ship-to so a phone-order draft can show who it matched.
 */
export const CUSTOMER_BY_CONTACT_SQL = `SELECT id,
            COALESCE(NULLIF(btrim(customer_name), ''), NULLIF(display_name, ''),
                     NULLIF(btrim(CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(last_name, ''))), '')) AS name,
            phone, email, shipping_address_1, shipping_address_2, shipping_city,
            shipping_state, shipping_postal_code, shipping_country
       FROM customers
      WHERE organization_id = $1
        AND ${customerContactMatchSql('$2', '$3')}
      ORDER BY id ASC
      LIMIT 1`;

/** The existing customer a phone number or email already belongs to (exact, never fuzzy). */
export async function findCustomerIdByContact(
  orgId: OrgId,
  contact: { phone?: string | null; email?: string | null },
): Promise<number | null> {
  const { phoneDigits, email } = customerContactKeys(contact);
  if (!phoneDigits && !email) return null;
  const existing = await tenantQuery<{ id: number }>(orgId, CUSTOMER_BY_CONTACT_SQL, [orgId, phoneDigits, email]);
  const found = existing.rows[0];
  return found ? Number(found.id) : null;
}

/** Find-or-create the `customers` row behind a PROVIDER contact (Ecwid today). */
export async function resolveProviderCustomerId(
  orgId: OrgId,
  contact: { name?: string | null; phone?: string | null; email?: string | null },
): Promise<number | null> {
  const email = String(contact.email ?? '').trim().toLowerCase();
  const name = String(contact.name ?? '').trim();
  if (!String(contact.phone ?? '').replace(/\D/g, '') && !email) return null;

  const found = await findCustomerIdByContact(orgId, contact);
  if (found != null) return found;

  const created = await createRepairCustomer(
    { name: name || email || contact.phone || '', phone: contact.phone ?? '', email: email || undefined },
    orgId,
  );
  return Number(created.id);
}

/**
 * Insert a customer typed on the phone (manual phone order), on the caller's
 * transaction. `organization_id` is the caller's org — never an input field.
 */
export async function insertCustomerInTx(
  client: CustomerDb,
  orgId: OrgId,
  input: CustomerCreate,
): Promise<{ id: number }> {
  const { first, last } = splitCustomerName(input.name);
  const s = input.shipTo;
  const result = await client.query<{ id: number }>(
    `INSERT INTO customers (
      customer_name, display_name, first_name, last_name, phone, email,
      shipping_address_1, shipping_address_2, shipping_city, shipping_state,
      shipping_postal_code, shipping_country, contact_type,
      organization_id, created_at, updated_at
    ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'customer', $12, NOW(), NOW())
    RETURNING id`,
    [
      input.name,
      first,
      last,
      input.phone || null,
      input.email || null,
      s?.address1 || null,
      s?.address2 || null,
      s?.city || null,
      s?.state || null,
      s?.postalCode || null,
      s?.country || null,
      orgId,
    ],
  );
  return { id: Number(result.rows[0].id) };
}

/**
 * Point an existing customer's ship-to at the address given on the phone —
 * only the fields actually given; blanks never erase a stored line.
 * `false` when the customer is not in this org.
 */
export async function setCustomerShipToInTx(
  client: CustomerDb,
  orgId: OrgId,
  customerId: number,
  shipTo: CustomerShipTo,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE customers
        SET shipping_address_1   = COALESCE(NULLIF($3, ''), shipping_address_1),
            shipping_address_2   = COALESCE(NULLIF($4, ''), shipping_address_2),
            shipping_city        = COALESCE(NULLIF($5, ''), shipping_city),
            shipping_state       = COALESCE(NULLIF($6, ''), shipping_state),
            shipping_postal_code = COALESCE(NULLIF($7, ''), shipping_postal_code),
            shipping_country     = COALESCE(NULLIF($8, ''), shipping_country),
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [customerId, orgId, shipTo.address1, shipTo.address2, shipTo.city, shipTo.state, shipTo.postalCode, shipTo.country],
  );
  return (result.rowCount ?? 0) > 0;
}

/** `POST /api/customers` — create one customer in the caller's org. */
export async function createCustomer(orgId: OrgId, input: CustomerCreate): Promise<{ id: number }> {
  return withTenantTransaction(orgId, (client) => insertCustomerInTx(client, orgId, input));
}

/**
 * Find a customer by phone number.
 */
async function findCustomerByPhone(phone: string, orgId?: OrgId): Promise<CustomerRecord | null> {
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
async function findCustomerByName(name: string, orgId?: OrgId): Promise<CustomerRecord | null> {
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

interface RepairCustomerParams {
  name: string;
  phone: string;
  email?: string;
  /** Callers: submitCounterTransaction.createCustomer. Schema: customers.shipping_address_1. User: "intake their information like name, email address, phone number, address" */
  address?: string;
  repairId?: number;
}

/** The tenant INSERT behind {@link createRepairCustomer}, on a caller's transaction. */
async function insertRepairCustomer(
  client: PoolClient,
  params: RepairCustomerParams,
  orgId: OrgId,
): Promise<CustomerRecord> {
  const { first, last } = splitCustomerName(params.name);
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
      first,
      last,
      params.phone || null,
      params.email || null,
      params.address?.trim() || null,
      params.repairId ? 'REPAIR' : null,
      params.repairId ?? null,
      orgId,
    ],
  );
  return result.rows[0];
}

/**
 * Create a customer linked to a repair service entity.
 */
export async function createRepairCustomer(params: RepairCustomerParams, orgId?: OrgId): Promise<CustomerRecord> {
  const { first: firstName, last: lastName } = splitCustomerName(params.name);

  if (orgId) {
    return withTenantTransaction(orgId, (client) => insertRepairCustomer(client, params, orgId));
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

type CustomerContactUpdateResult =
  | {
      ok: true;
      before: CustomerContactColumns;
      /** Only the columns that changed; empty = nothing was written. */
      columns: Partial<CustomerContactColumns>;
      /** Repairs pointing at this customer — they display its name/phone/email. */
      repairIds: number[];
    }
  | { ok: false; status: 400 | 404; error: string };

/** Correct a customer's contact columns (`PATCH /api/customers/[id]`). */
export async function updateCustomerContact(
  customerId: number,
  patch: CustomerContactPatch,
  orgId: OrgId,
): Promise<CustomerContactUpdateResult> {
  return withTenantTransaction(orgId, async (client) => {
    const found = await client.query<CustomerContactColumns>(
      `SELECT customer_name, display_name, first_name, last_name, phone, email
         FROM customers
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [customerId, orgId],
    );
    const before = found.rows[0];
    if (!before) return { ok: false as const, status: 404 as const, error: 'Customer not found' };

    const plan = customerContactColumns(before, patch);
    if (!plan.ok) return { ok: false as const, status: 400 as const, error: plan.error };

    const entries = Object.entries(plan.columns);
    if (entries.length > 0) {
      await client.query(
        `UPDATE customers
            SET ${entries.map(([col], i) => `${col} = $${i + 3}`).join(', ')}, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
        [customerId, orgId, ...entries.map(([, value]) => value)],
      );
    }

    const repairs = await client.query<{ id: number }>(
      `SELECT id FROM repair_service WHERE customer_id = $1 AND organization_id = $2`,
      [customerId, orgId],
    );
    return { ok: true as const, before, columns: plan.columns, repairIds: repairs.rows.map((r) => Number(r.id)) };
  });
}

export type RepairCustomerLinkResult =
  | { ok: true; before: { customer_id: number | null }; after: { customer_id: number | null } }
  | { ok: false; status: 404; error: string };

/** Point a repair at a customer, or at none (`customerId` null = unlink). */
export async function setRepairCustomer(
  repairId: number,
  customerId: number | null,
  orgId: OrgId,
): Promise<RepairCustomerLinkResult> {
  return withTenantTransaction(orgId, async (client) => {
    const repair = await client.query<{ customer_id: number | null }>(
      `SELECT customer_id FROM repair_service WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [repairId, orgId],
    );
    if (!repair.rows[0]) return { ok: false as const, status: 404 as const, error: 'Repair not found' };

    if (customerId != null) {
      const customer = await client.query(
        `SELECT 1 FROM customers WHERE id = $1 AND organization_id = $2`,
        [customerId, orgId],
      );
      if (!customer.rows[0]) return { ok: false as const, status: 404 as const, error: 'Customer not found' };
    }

    await client.query(
      `UPDATE repair_service SET customer_id = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      [customerId, repairId, orgId],
    );
    return {
      ok: true as const,
      before: { customer_id: repair.rows[0].customer_id ?? null },
      after: { customer_id: customerId },
    };
  });
}

/**
 * Create a customer from contact typed on the phone and point the repair at it,
 * in one transaction. Replaces any current link; the previous customer row is
 * kept.
 */
export async function createAndLinkRepairCustomer(
  repairId: number,
  input: RepairCustomerCreate,
  orgId: OrgId,
): Promise<RepairCustomerLinkResult> {
  return withTenantTransaction(orgId, async (client) => {
    const repair = await client.query<{ customer_id: number | null }>(
      `SELECT customer_id FROM repair_service WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [repairId, orgId],
    );
    if (!repair.rows[0]) return { ok: false as const, status: 404 as const, error: 'Repair not found' };

    const created = await insertRepairCustomer(
      client,
      { name: input.name, phone: input.phone, email: input.email, repairId },
      orgId,
    );
    const customerId = Number(created.id);
    await client.query(
      `UPDATE repair_service SET customer_id = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      [customerId, repairId, orgId],
    );
    return {
      ok: true as const,
      before: { customer_id: repair.rows[0].customer_id ?? null },
      after: { customer_id: customerId },
    };
  });
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

interface CustomerSearchResult {
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

/** Operator customer search ("customer calls back — find them"): */
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
