/**
 * get_customer — "a customer calls back, find them" (chat-roi row 9). GREEN.
 *
 * One read answers the phone: who the caller is (name, phone, email), where
 * we ship them, their last orders (each opens its record) and the support
 * tickets still open on those orders or their repairs. Lookup is the customer
 * book's own search (`searchCustomers`: name, email, phone / mobile last-10);
 * an exact phone or email match wins over fuzzy name hits
 * (`customerContactMatchSql`). Several people → a candidates table and the
 * question "which one?", never a guess.
 *
 * The dossier — the person, their last orders, their open tickets, and for a
 * phone / email the contact match itself — is ONE statement on ONE connection
 * in ONE round trip (`tenantQueryOneTrip`): a scanned phone is answered in a
 * single pool checkout even while the pool is busy with list reads.
 *
 * Every statement carries `organization_id = $1` from ctx; the model passes
 * only the name / phone / email the operator typed.
 */

import { z } from 'zod';
import { brandReportEnvelope, type ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactIdentity, ArtifactRecord, ArtifactTable } from '@/lib/assistant/ui-artifacts';
import { customerAddressLines, customerFullName, customerPhone, type CustomerRecord } from '@/lib/customers/customer-display';
import { customerContactKeys, customerContactMatchSql, searchCustomers } from '@/lib/neon/customer-queries';
import { formatSearchSel } from '@/lib/search/search-selection';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { AssistantToolDef } from './types';

// ─── Query shape (pure) ──────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export type CustomerQueryKind = 'email' | 'phone' | 'name';

/** How the operator identified the caller: an email, a phone (10+ digits), else a name. */
export function customerQueryKind(query: string): CustomerQueryKind {
  const text = query.trim();
  if (EMAIL_RE.test(text)) return 'email';
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 15 && /^[\d\s().+-]+$/.test(text)) return 'phone';
  return 'name';
}

// ─── Dossier (pure) ──────────────────────────────────────────────────────────

export interface DossierOrder {
  id: number;
  orderNumber: string | null;
  date: string | null;
  status: string | null;
  title: string | null;
  channel: string | null;
}

export interface DossierTicket {
  id: number;
  externalId: string | null;
  subject: string | null;
  status: string | null;
}

export interface CustomerDossier {
  customer: CustomerRecord;
  orderCount: number;
  orders: DossierOrder[];
  tickets: DossierTicket[];
}

const ORDERS_SHOWN = 8;
const TICKETS_SHOWN = 5;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function day(v: string | null): string | null {
  return v ? v.slice(0, 10) : null;
}

function sentenceCase(s: string): string {
  const t = s.replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

/** The record card: identity first, then ship-to, orders (each linked), open tickets. */
export function buildDossierEnvelope(d: CustomerDossier): ToolArtifactEnvelope {
  const c = d.customer;
  const name = customerFullName(c) || c.email || customerPhone(c) || `Customer ${c.id}`;
  const phone = customerPhone(c);
  const address = customerAddressLines(c);
  const latest = d.orders[0] ?? null;
  const latestHref = latest ? `/search?sel=${formatSearchSel('order', latest.id)}` : null;
  const identity: ArtifactIdentity = {
    title: name.slice(0, 120),
    ...(address.length ? { subtitle: address.join(', ').slice(0, 160) } : {}),
    ids: [
      ...(phone ? [{ label: 'Phone' as const, value: phone.slice(0, 80) }] : []),
      ...(c.email ? [{ label: 'Email' as const, value: c.email.slice(0, 80) }] : []),
      ...(latest?.orderNumber ? [{ label: 'Order' as const, value: latest.orderNumber.slice(0, 80) }] : []),
    ],
    chips: [plural(d.orderCount, 'order'), ...(d.tickets.length ? [plural(d.tickets.length, 'open ticket')] : [])],
    ...(latestHref ? { href: latestHref } : {}),
  };
  const fields: ArtifactRecord['fields'] = [
    { label: 'Phone', value: phone || 'Not on file' },
    { label: 'Email', value: c.email || 'Not on file' },
    { label: 'Ship to', value: address.length ? address.join(', ').slice(0, 300) : 'No stored address' },
    ...d.orders.slice(0, ORDERS_SHOWN).map((o) => ({
      label: `Order ${o.orderNumber ?? `#${o.id}`}`.slice(0, 80),
      value: [day(o.date), o.status ? sentenceCase(o.status) : null, o.channel, o.title].filter(Boolean).join(' · ').slice(0, 300) || '—',
      href: `/search?sel=${formatSearchSel('order', o.id)}`,
    })),
    ...d.tickets.slice(0, TICKETS_SHOWN).map((t) => ({
      label: `Ticket #${t.externalId ?? t.id}`.slice(0, 80),
      value: [t.status ? sentenceCase(t.status) : 'Open', t.subject].filter(Boolean).join(' · ').slice(0, 300),
    })),
  ];
  const card: ArtifactRecord = {
    kind: 'record',
    title: name.slice(0, 120),
    path: latestHref ?? `/search?q=${encodeURIComponent((c.email || phone || name).slice(0, 200))}`,
    fields: fields.slice(0, 20),
    identity,
  };
  const orderLine = latest
    ? `${plural(d.orderCount, 'order')}, the latest ${latest.orderNumber ?? `#${latest.id}`}${latest.date ? ` on ${day(latest.date)}` : ''}${latest.status ? ` (${sentenceCase(latest.status).toLowerCase()})` : ''}`
    : 'no orders yet';
  const ticketLine = d.tickets.length
    ? `${plural(d.tickets.length, 'open ticket')} (${d.tickets.slice(0, 3).map((t) => `#${t.externalId ?? t.id}`).join(', ')})`
    : 'no open tickets';
  const answer = `${name}${phone ? `, ${phone}` : ''}${c.email ? `, ${c.email}` : ''}: ${orderLine}; ${ticketLine}.${address.length ? ` Ships to ${address.join(', ')}.` : ''}`;
  return brandReportEnvelope(
    { artifact: card, summary: `${answer} The customer card is already on screen — do not render it again.`, answer },
    'get_customer',
  );
}

export interface CustomerCandidate {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  lastOrderRef: string | null;
  lastOrderDate: string | null;
}

/** Several people match: the table and one question, never a pick. */
export function buildCandidatesEnvelope(query: string, candidates: readonly CustomerCandidate[]): ToolArtifactEnvelope {
  const artifact: ArtifactTable = {
    kind: 'table',
    title: `Customers matching "${query}"`.slice(0, 120),
    columns: ['Customer', 'Phone', 'Email', 'City', 'Last order', 'Last order date'],
    rows: candidates.map((c) => ({
      Customer: c.name,
      Phone: c.phone,
      Email: c.email,
      City: c.city,
      'Last order': c.lastOrderRef,
      'Last order date': day(c.lastOrderDate),
    })),
    entityHint: 'customer',
    idColumn: 'Customer',
  };
  const top = candidates.slice(0, 5).map((c) => `${c.name}${c.phone ? ` (${c.phone})` : c.email ? ` (${c.email})` : ''}`).join('; ');
  const answer = `${plural(candidates.length, 'customer')} match "${query}" — which one? Give me their phone or email to narrow it down.`;
  return brandReportEnvelope(
    {
      artifact,
      summary: `${candidates.length} customers match "${query}": ${top}. The candidates table is already on screen. Ask which one they mean (phone or email); do not pick one.`,
      answer,
    },
    'get_customer',
  );
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/**
 * The dossier in one statement: the customer by id (`$2`) or by contact
 * (`$3` last-10 phone digits / `$4` lowercased email), their order count, the
 * last orders and the open tickets on those orders' shipments or their repairs
 * (`ticket_links`). No row = no such customer.
 */
const DOSSIER_SQL = `WITH c AS (
  SELECT id, display_name, customer_name, first_name, last_name, email, phone, mobile,
         shipping_address_1, shipping_address_2, shipping_city, shipping_state,
         shipping_postal_code, shipping_country, created_at::text AS created_at
    FROM customers
   WHERE organization_id = $1
     AND (id = $2 OR ${customerContactMatchSql('$3', '$4')})
   ORDER BY id ASC
   LIMIT 1
)
SELECT c.*,
  (SELECT COUNT(*)::int FROM orders o WHERE o.organization_id = $1 AND o.customer_id = c.id) AS order_count,
  (SELECT COALESCE(json_agg(x ORDER BY x.sort_at DESC NULLS LAST, x.id DESC), '[]'::json)
     FROM (SELECT o.id, o.order_id, COALESCE(o.order_date, o.created_at)::text AS at, o.status,
                  o.product_title, o.account_source, COALESCE(o.order_date, o.created_at) AS sort_at
             FROM orders o
            WHERE o.organization_id = $1 AND o.customer_id = c.id
            ORDER BY COALESCE(o.order_date, o.created_at) DESC NULLS LAST, o.id DESC
            LIMIT ${ORDERS_SHOWN}) x) AS orders,
  (SELECT COALESCE(json_agg(t ORDER BY t.updated_at DESC NULLS LAST), '[]'::json)
     FROM (SELECT DISTINCT st.id, st.external_ticket_id, st.subject_cache, st.status_cache, st.updated_at
             FROM support_tickets st
             JOIN ticket_links tl ON tl.support_ticket_id = st.id AND tl.organization_id = $1
            WHERE st.organization_id = $1
              AND COALESCE(lower(st.status_cache), 'open') NOT IN ('closed', 'solved')
              AND (
                (tl.entity_type = 'SHIPMENT' AND tl.entity_id IN (
                   SELECT o.shipment_id FROM orders o
                    WHERE o.organization_id = $1 AND o.customer_id = c.id AND o.shipment_id IS NOT NULL))
                OR (tl.entity_type = 'REPAIR' AND tl.entity_id IN (
                   SELECT r.id FROM repair_service r WHERE r.organization_id = $1 AND r.customer_id = c.id))
              )
            ORDER BY st.updated_at DESC NULLS LAST
            LIMIT ${TICKETS_SHOWN}) t) AS tickets
  FROM c`;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

type DossierKey = { id: number } | { contact: { phone?: string; email?: string } };

function jsonRows(v: unknown): Array<Record<string, unknown>> {
  const parsed = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
}

async function loadDossier(orgId: OrgId, key: DossierKey): Promise<CustomerDossier | null> {
  const { phoneDigits, email } = 'contact' in key ? customerContactKeys(key.contact) : { phoneDigits: '', email: '' };
  const { rows } = await tenantQueryOneTrip(orgId, DOSSIER_SQL, [orgId, 'id' in key ? key.id : null, phoneDigits, email]);
  const row = rows[0];
  if (!row) return null;
  const { order_count, orders, tickets, ...customer } = row as Record<string, unknown>;
  return {
    customer: customer as unknown as CustomerRecord,
    orderCount: Number(order_count ?? 0),
    orders: jsonRows(orders).map((o) => ({
      id: Number(o.id),
      orderNumber: str(o.order_id),
      date: str(o.at),
      status: str(o.status),
      title: str(o.product_title),
      channel: str(o.account_source),
    })),
    tickets: jsonRows(tickets).map((t) => ({
      id: Number(t.id),
      externalId: str(t.external_ticket_id),
      subject: str(t.subject_cache),
      status: str(t.status_cache),
    })),
  };
}

const customerInput = z.object({
  query: z.string().trim().min(2).max(200).describe('The caller\'s name, phone number or email exactly as typed.'),
});

export const getCustomer: AssistantToolDef<typeof customerInput> = {
  name: 'get_customer',
  description:
    'Customer dossier: WHO is this caller — by name, phone or email. Returns their phone, email, stored ship-to address, last orders and open support tickets (shows the customer card itself), or a candidates table when several people match. Use for "who is 512-555-0101", "customer calls back", "find customer jane@x.com", "what did John Smith order".',
  permission: 'orders.view',
  inputSchema: customerInput,
  run: async (input, ctx) => {
    const org = ctx.organizationId;
    const query = input.query.trim();
    const kind = customerQueryKind(query);
    // An exact phone / email is one person — matched inside the dossier read, not a fuzzy search.
    if (kind !== 'name') {
      const exact = await loadDossier(org, { contact: kind === 'email' ? { email: query } : { phone: query } });
      if (exact) return buildDossierEnvelope(exact);
    }
    const hits = await searchCustomers(query, org, 25);
    if (hits.length === 1) {
      const dossier = await loadDossier(org, { id: hits[0].id });
      if (dossier) return buildDossierEnvelope(dossier);
    }
    if (hits.length === 0) {
      return {
        found: false,
        query,
        message: `No customer in this workspace matches "${query}" (searched name, email, phone and mobile).`,
      };
    }
    return buildCandidatesEnvelope(
      query,
      hits.map((h) => ({
        id: h.id,
        name: h.name,
        phone: h.phone,
        email: h.email,
        city: [h.shippingAddress.city, h.shippingAddress.state].filter(Boolean).join(', ') || null,
        lastOrderRef: h.lastOrder?.orderRef ?? null,
        lastOrderDate: h.lastOrder?.orderDate ?? null,
      })),
    );
  },
};
