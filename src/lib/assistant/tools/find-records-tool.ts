/**
 * `find_records` — the assistant's ONE record finder, served by the same door
 * as `/search` and the ⌘K palette (`serveFindRecords` → `findRecords`: exact
 * identifier arms, relaxation ladder, org-partitioned cache, `search_query_log`
 * with `surface: 'assistant'`). A query that resolves on `/search` resolves
 * identically here (HANDOFF-search-triage-record, AI track A1).
 *
 * The rows go to the screen as a server-carried artifact (never retyped by the
 * model): one record → a record card led by its identity header (order #,
 * customer, platform, status; serial; PO/tracking) linking to
 * `/search?sel=<type>:<id>`; several → a table, headed by the customer when
 * they all belong to one buyer. The model reads a short summary.
 */

import { z } from 'zod';
import type { GlobalSearchResult } from '@/lib/search/global-entity-search';
import { formatSearchSel, isSearchRecordType } from '@/lib/search/search-selection';
import { serveFindRecords } from '@/lib/search/serve-find-records';
import { hitOpensOwnPage } from '@/lib/search/commit-identifier-find';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactIdentity, ArtifactRecord, ArtifactTable } from '@/lib/assistant/ui-artifacts';
import type { AssistantToolDef } from './types';

const ENTITY_NOUN: Record<GlobalSearchResult['entityType'], string> = {
  order: 'Order',
  unit: 'Unit',
  receiving: 'Receiving',
  sku: 'Product',
  repair: 'Repair',
  fba: 'FBA shipment',
  warranty: 'Warranty claim',
  ticket: 'Ticket',
  location: 'Bin',
  exception: 'Exception',
  import_exception: 'Import exception',
  tote: 'Tote',
};

/** `awaiting_shipment` → `Awaiting shipment`. */
function statusLabel(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().replace(/[_-]+/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null;
}

function platformLabel(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const label = sourcePlatformLabel(value);
  return label === 'Unknown' ? value : label;
}

function day(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/** `/search?sel=order:123` — the record's durable home. Null for kinds `/search` cannot select (a tote opens `/tote/{id}`) and for the SKU arm's hit (its SKU record page). */
export function recordSearchHref(row: Pick<GlobalSearchResult, 'entityType' | 'id' | 'href'>): string | null {
  if (hitOpensOwnPage(row)) return null;
  return isSearchRecordType(row.entityType) && row.id > 0 ? `/search?sel=${formatSearchSel(row.entityType, row.id)}` : null;
}

type IdentityIds = ArtifactIdentity['ids'];

function pushId(ids: IdentityIds, label: IdentityIds[number]['label'], value: string | null | undefined) {
  const v = String(value ?? '').trim();
  if (v && v.length <= 80 && !ids.some((id) => id.label === label && id.value === v)) ids.push({ label, value: v });
}

/** A found record's identity header, built only from the row the search returned. */
export function identityOfRecord(row: GlobalSearchResult): ArtifactIdentity {
  const f = row.facets ?? {};
  const ids: IdentityIds = [];
  const chips = [platformLabel(f.source_platform), statusLabel(f.status)].filter((c): c is string => Boolean(c));
  const href = recordSearchHref(row) ?? undefined;
  const clip = (s: string) => s.slice(0, 120);
  switch (row.entityType) {
    case 'order': {
      pushId(ids, 'Order', f.order_id);
      pushId(ids, 'Tracking', f.tracking_number);
      pushId(ids, 'Serial', f.serial_number);
      pushId(ids, 'Email', f.customer_email);
      pushId(ids, 'Phone', f.customer_phone);
      const subtitle = [f.customer_name, row.title].filter(Boolean).join(' · ');
      return {
        title: clip(`Order ${f.order_id ?? `#${row.id}`}`),
        ...(subtitle ? { subtitle: subtitle.slice(0, 160) } : {}),
        ids,
        ...(chips.length ? { chips } : {}),
        ...(href ? { href } : {}),
      };
    }
    case 'receiving':
      pushId(ids, 'PO', f.po_number);
      pushId(ids, 'Order', f.source_order_id);
      pushId(ids, 'Tracking', f.tracking_number);
      break;
    case 'unit':
      pushId(ids, 'Serial', f.serial_number ?? row.title);
      break;
    case 'sku':
      pushId(ids, 'SKU', row.subtitle);
      break;
    case 'location':
      pushId(ids, 'Bin', row.title);
      break;
    default:
      pushId(ids, 'Serial', f.serial_number);
  }
  return {
    title: clip(row.title || `${ENTITY_NOUN[row.entityType]} ${row.id}`),
    ...(row.subtitle ? { subtitle: row.subtitle.slice(0, 160) } : {}),
    ids,
    ...(chips.length ? { chips } : {}),
    ...(href ? { href } : {}),
  };
}

/** The one-card view of a single found record. */
function recordCard(row: GlobalSearchResult): ArtifactRecord {
  const f = row.facets ?? {};
  const identity = identityOfRecord(row);
  const fields: ArtifactRecord['fields'] = [];
  const add = (label: string, value: string | null | undefined) => {
    const v = String(value ?? '').trim();
    if (v) fields.push({ label, value: v.slice(0, 300) });
  };
  if (row.entityType === 'order') {
    add('Product', row.title);
    add('Customer', f.customer_name);
  } else {
    add('Detail', row.subtitle);
  }
  add('Platform', platformLabel(f.source_platform));
  add('Status', statusLabel(f.status));
  add('Tracking', [f.tracking_number, f.carrier].filter(Boolean).join(' · '));
  add('Serial', f.serial_number);
  add('Condition', f.condition_grade);
  add('Date', day(f.happened_at));
  return {
    kind: 'record',
    title: identity.title,
    path: identity.href ?? (row.href.startsWith('/') && !row.href.startsWith('//') ? row.href : '/search'),
    fields: fields.slice(0, 20),
    identity,
  };
}

/** Several records: a table, headed by the buyer when every row is one customer's order. */
function recordsTable(query: string, rows: GlobalSearchResult[]): ArtifactTable {
  const buyers = new Set(rows.map((r) => (r.entityType === 'order' ? (r.facets?.customer_name ?? '').trim() : '')));
  const [buyer] = [...buyers];
  const oneCustomer = buyers.size === 1 && Boolean(buyer);
  let identity: ArtifactIdentity | undefined;
  if (oneCustomer) {
    const ids: IdentityIds = [];
    for (const r of rows) {
      pushId(ids, 'Email', r.facets?.customer_email);
      pushId(ids, 'Phone', r.facets?.customer_phone);
    }
    identity = { title: buyer.slice(0, 120), subtitle: `Customer · ${rows.length} orders`, ids: ids.slice(0, 12) };
  }
  return {
    kind: 'table',
    title: (oneCustomer ? `Orders for ${buyer}` : `Records matching "${query}"`).slice(0, 120),
    columns: ['Record', 'Type', 'Detail', 'Status'],
    rows: rows.map((r) => ({
      Record: r.entityType === 'order' ? `Order ${r.facets?.order_id ?? r.id}` : r.title,
      Type: ENTITY_NOUN[r.entityType],
      Detail: r.entityType === 'order' ? r.title : r.subtitle,
      Status: statusLabel(r.facets?.status),
    })),
    entityHint: 'record',
    idColumn: 'Record',
    ...(identity ? { identity } : {}),
  };
}

/** One plain sentence for a found record — the fast path shows it as the answer, the model reads it. */
export function describeRecord(row: GlobalSearchResult): string {
  const f = row.facets ?? {};
  if (row.entityType === 'order') {
    const who = f.customer_name ? ` for ${f.customer_name}` : '';
    const where = platformLabel(f.source_platform);
    const status = statusLabel(f.status);
    // The product is quoted and labelled: a product title can itself read like
    // an order number ("Order #19444"), and a model then answers with it.
    return `Order ${f.order_id ?? `#${row.id}`}${who}${where ? ` on ${where}` : ''}${status ? ` is ${status.toLowerCase()}` : ''} — product "${row.title}".`;
  }
  const status = statusLabel(f.status);
  const detail = row.subtitle ? ` (${row.subtitle})` : status ? ` — ${status.toLowerCase()}` : '';
  return `${ENTITY_NOUN[row.entityType]} ${row.title}${detail}.`;
}

const findRecordsInput = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('What the operator typed: an order #, tracking, serial, SKU, PO, customer name / email / phone, or a few words.'),
  limit: z.number().int().min(1).max(25).default(10),
});

export const findRecordsTool: AssistantToolDef<typeof findRecordsInput> = {
  name: 'find_records',
  description:
    'Find records — orders, serialized units, receiving cartons (PO / tracking), products, repairs, FBA shipments, tickets — by any identifier (order #, tracking, serial, SKU, PO) or by a customer name, email, phone or a few words. The same search as the Search page. Shows the record (or the list) to the operator itself; returns a short summary.',
  permission: 'assistant.chat',
  inputSchema: findRecordsInput,
  run: async (input, ctx, deps) => {
    const serve = deps.findRecords ?? serveFindRecords;
    const { payload } = await serve({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      query: input.query,
      limit: input.limit,
      surface: 'assistant',
    });
    const rows = payload.rows;
    if (rows.length === 0) {
      return {
        found: false,
        query: input.query,
        message: `No record in this workspace matches "${input.query}" (searched orders, units, receiving, products, repairs, FBA shipments, tickets).`,
      };
    }
    const relaxedNote = payload.relaxed ? ` Nothing matched "${input.query}" exactly; these match the broader "${payload.effectiveQuery}".` : '';
    if (rows.length === 1) {
      return brandReportEnvelope(
        {
          artifact: recordCard(rows[0]),
          summary: `${describeRecord(rows[0])}${relaxedNote} The record card is already on screen — do not render it again; answer in one sentence.`,
          answer: `${describeRecord(rows[0])}${relaxedNote}`,
        },
        'find_records',
      );
    }
    const top = rows.slice(0, 6).map(describeRecord).join(' ');
    const buyer = rows.every((r) => r.entityType === 'order' && r.facets?.customer_name === rows[0].facets?.customer_name)
      ? rows[0].facets?.customer_name
      : null;
    return brandReportEnvelope(
      {
        artifact: recordsTable(input.query, rows),
        summary: `${rows.length} records match "${input.query}".${relaxedNote} ${top} The list is already on screen — do not render it again.`,
        answer: buyer
          ? `${buyer} has ${rows.length} orders${rows.length >= input.limit ? ' (most recent shown)' : ''}.${relaxedNote}`
          : `${rows.length} records match "${input.query}".${relaxedNote}`,
      },
      'find_records',
    );
  },
};
