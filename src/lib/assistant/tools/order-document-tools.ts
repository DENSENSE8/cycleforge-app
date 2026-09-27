/**
 * Order paperwork read tool — "show me the shipping label for order 4899".
 *
 * GREEN, org-scoped read. It resolves the order by its number (or row id) and
 * answers with a SERVER-CARRIED `document` artifact (`brandReportEnvelope`):
 * the shipping labels and packing slips linked in the outbound documents store
 * (`listDocumentsForOrder`, the same read `/api/orders/[id]/documents` serves)
 * plus the paired paperwork the To-ship paperwork panel shows
 * (`listOrderManuals`). Every file is referenced by its existing auth-gated
 * content route, never by a storage URL, so the rail streams bytes through the
 * same permission check the order page uses.
 *
 * A miss is a plain result that names what was searched: an unknown order and
 * an order with nothing on file are both said honestly, never pointed at an
 * empty rail. The tool never prints — printing stays the operator's click.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import type { OutboundDocument } from '@/lib/documents/types';
import type { OrderManual } from '@/lib/manuals/order-manuals';
import { outboundDocumentContentSrc, isPdfOutboundDocument } from '@/lib/documents/outbound-document-display';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactDocument } from '@/lib/assistant/ui-artifacts';
import type { AssistantToolDef, AssistantToolDeps } from './types';

export interface OrderDocumentDeps {
  listDocuments: (orgId: OrgId, orderRowId: number) => Promise<OutboundDocument[]>;
  /** Paired paperwork for one order row; an order the manuals desk cannot resolve is []. */
  listManuals: (orgId: OrgId, orderRowId: number) => Promise<OrderManual[]>;
}

// Both readers are `server-only` — lazy defaults keep the registry importable from node:test.
const defaultOrderDocumentDeps: OrderDocumentDeps = {
  listDocuments: async (orgId, orderRowId) =>
    (await import('@/lib/documents/outbound-documents')).listDocumentsForOrder(orgId, orderRowId),
  listManuals: async (orgId, orderRowId) => {
    const { listOrderManuals, OrderManualError } = await import('@/lib/manuals/order-manuals');
    try {
      return (await listOrderManuals(orgId, orderRowId)).manuals;
    } catch (error) {
      if (error instanceof OrderManualError && error.status === 404) return [];
      throw error;
    }
  },
};

// ─── Input ──────────────────────────────────────────────────────────────────

export const ORDER_DOCUMENT_TYPES = ['any', 'shipping_label', 'packing_slip', 'paperwork'] as const;
type RequestedType = (typeof ORDER_DOCUMENT_TYPES)[number];

const input = z.object({
  order: z
    .string()
    .min(1)
    .max(120)
    .describe('The order number exactly as the operator typed it (e.g. 4899, #4899, 111-5202086-4729848).'),
  type: z
    .enum(ORDER_DOCUMENT_TYPES)
    .default('any')
    .describe('Which paper they asked for: shipping_label, packing_slip, paperwork (manuals / packing lists / invoices), or any.'),
});

/** "Order #4899." → "4899". Strips one leading label word and wrapping punctuation. */
export function cleanOrderRef(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
    .replace(/^(?:order|ord)\s*(?:#|:|no\.?|number)?\s*/i, '')
    .replace(/^#\s*/, '')
    .replace(/[?.!,;]+$/, '')
    .trim();
}

// ─── SQL (every statement: organization_id = $1) ────────────────────────────

const BY_ORDER_NUMBER_SQL = `
  SELECT o.id, o.order_id, o.product_title
    FROM orders o
   WHERE o.organization_id = $1 AND upper(btrim(o.order_id)) = upper($2)
   ORDER BY o.id DESC
   LIMIT 20`;

const BY_ROW_ID_SQL = `
  SELECT o.id, o.order_id, o.product_title
    FROM orders o
   WHERE o.organization_id = $1 AND o.id = $2
   LIMIT 1`;

/**
 * The order rows an operator's order reference names, newest first: the
 * order number, else (all digits) the record id. [] when neither matches.
 */
export async function findOrderRowsByRef(
  deps: AssistantToolDeps,
  org: OrgId,
  ref: string,
): Promise<Array<Record<string, unknown>>> {
  const { rows } = await deps.query(org, BY_ORDER_NUMBER_SQL, [org, ref]);
  if (rows.length > 0 || !/^\d{1,12}$/.test(ref)) return rows;
  return (await deps.query(org, BY_ROW_ID_SQL, [org, Number(ref)])).rows;
}

// ─── Shaping ────────────────────────────────────────────────────────────────

type DocEntry = ArtifactDocument['documents'][number];

const TYPE_LABEL: Record<string, string> = {
  shipping_label: 'Shipping label',
  packing_slip: 'Packing slip',
};

const TYPE_RANK: Record<string, number> = { shipping_label: 0, packing_slip: 1, manual: 2 };

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function manualMime(fileName: string | null): string {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName ?? '')?.[1]?.toLowerCase();
  if (ext === 'png' || ext === 'gif' || ext === 'webp') return `image/${ext}`;
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/pdf';
}

function outboundEntry(doc: OutboundDocument): DocEntry {
  const mime = doc.data.mimeType?.trim() || (isPdfOutboundDocument(doc) ? 'application/pdf' : 'image/png');
  return {
    id: `doc:${doc.id}`,
    label: TYPE_LABEL[doc.documentType] ?? 'Document',
    docType: doc.documentType,
    mime,
    url: outboundDocumentContentSrc(doc)!,
  };
}

function manualEntry(manual: OrderManual): DocEntry | null {
  if (!manual.contentUrl) return null;
  return {
    id: `manual:${manual.id}`,
    label: (manual.displayName || 'Paperwork').slice(0, 80),
    docType: 'manual',
    mime: manualMime(manual.fileName),
    url: manual.contentUrl,
  };
}

function wantsType(requested: RequestedType, docType: string): boolean {
  if (requested === 'any') return true;
  if (requested === 'paperwork') return docType === 'manual';
  return docType === requested;
}

/** Requested type first, then label → slip → paperwork; duplicate faces numbered. */
function orderEntries(entries: DocEntry[], requested: RequestedType): DocEntry[] {
  const sorted = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const wa = wantsType(requested, a.e.docType) ? 0 : 1;
      const wb = wantsType(requested, b.e.docType) ? 0 : 1;
      return wa - wb || (TYPE_RANK[a.e.docType] ?? 3) - (TYPE_RANK[b.e.docType] ?? 3) || a.i - b.i;
    })
    .map(({ e }) => e);
  const seen = new Map<string, number>();
  return sorted.map((e) => {
    const n = (seen.get(e.label) ?? 0) + 1;
    seen.set(e.label, n);
    return n === 1 ? e : { ...e, label: `${e.label} ${n}`.slice(0, 80) };
  });
}

const REQUESTED_FACE: Record<Exclude<RequestedType, 'any'>, string> = {
  shipping_label: 'shipping label',
  packing_slip: 'packing slip',
  paperwork: 'paired paperwork',
};

function listFaces(entries: readonly DocEntry[]): string {
  const faces = entries.map((e) => (e.docType === 'manual' ? e.label : e.label.toLowerCase()));
  if (faces.length <= 1) return faces.join('');
  return `${faces.slice(0, -1).join(', ')} and ${faces[faces.length - 1]}`;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export const getOrderDocuments: AssistantToolDef<typeof input> = {
  name: 'get_order_documents',
  description:
    'SHOW an order\'s paperwork: its shipping label, packing slip and paired paperwork (manuals, packing lists, invoices). Use for "show me the shipping label for order 4899", "pull up the packing slip for …", "order … documents / paperwork". Pass the order number exactly as typed. Opens the files in the document viewer beside the chat itself (do not call render_artifact) or returns found=false / no documents with what was searched. It never prints.',
  permission: 'orders.view',
  inputSchema: input,
  run: async (args, ctx, deps) => {
    const d =
      (deps as AssistantToolDeps & { orderDocuments?: OrderDocumentDeps }).orderDocuments ??
      defaultOrderDocumentDeps;
    const org = ctx.organizationId;
    const ref = cleanOrderRef(args.order);
    const requested: RequestedType = args.type;
    if (ref.length === 0) {
      return { found: false, order: args.order, message: 'The order number is empty after removing the label word.' };
    }

    const rows = await findOrderRowsByRef(deps, org, ref);
    if (rows.length === 0) {
      return {
        found: false,
        order: ref,
        searched: ['order number', 'order record id'],
        message: `No order "${ref}" exists in this workspace, so there are no documents to show.`,
      };
    }

    const orderNumber = str(rows[0].order_id) ?? ref;
    const product = str(rows[0].product_title);
    const rowIds = [...new Set(rows.map((r) => Number(r.id)))];
    const [docLists, manualLists] = await Promise.all([
      Promise.all(rowIds.map((id) => d.listDocuments(org, id))),
      Promise.all(rowIds.map((id) => d.listManuals(org, id))),
    ]);

    const docs = new Map<number, OutboundDocument>();
    for (const doc of docLists.flat()) if (!docs.has(doc.id)) docs.set(doc.id, doc);
    const manuals = new Map<number, OrderManual>();
    for (const m of manualLists.flat()) if (!manuals.has(m.id)) manuals.set(m.id, m);

    const entries = orderEntries(
      [
        ...[...docs.values()].map(outboundEntry),
        ...[...manuals.values()].map(manualEntry).filter((e): e is DocEntry => e !== null),
      ],
      requested,
    ).slice(0, 20);

    const orderFace = `Order ${orderNumber}${product ? ` (${product})` : ''}`;
    if (entries.length === 0) {
      return {
        found: true,
        order: orderNumber,
        documents: 0,
        searched: ['shipping labels', 'packing slips', 'paired paperwork'],
        message: `${orderFace} has no shipping label, packing slip or paired paperwork on file — there is nothing to open.`,
      };
    }

    const label = [...docs.values()].find((doc) => doc.documentType === 'shipping_label');
    const carrierLine = label
      ? [str(label.data.carrier), str(label.data.tracking) ? `tracking ${str(label.data.tracking)}` : null]
          .filter(Boolean)
          .join(', ')
      : '';

    const artifact: ArtifactDocument = {
      kind: 'document',
      // The rail header names what the switcher holds, not just the first file.
      title: `Order ${orderNumber} · ${
        entries.length === 1
          ? entries[0].label
          : entries.length === 2
            ? `${entries[0].label} + ${entries[1].docType === 'manual' ? entries[1].label : entries[1].label.toLowerCase()}`
            : `${entries[0].label} + ${entries.length - 1} more`
      }`.slice(0, 120),
      subtitle: [entries.length > 1 ? `${entries.length} documents` : null, product].filter(Boolean).join(' · ').slice(0, 200) || undefined,
      documents: entries,
      entityHint: 'order',
    };

    const missing =
      requested !== 'any' && !entries.some((e) => wantsType(requested, e.docType))
        ? `${orderFace} has no ${REQUESTED_FACE[requested]} on file. `
        : '';
    const summary = `${missing}${missing ? `Its ${listFaces(entries)}` : `${orderFace}: the ${listFaces(entries)}`} ${
      entries.length === 1 ? 'is' : 'are'
    } open in the document viewer beside the chat.${carrierLine ? ` Label: ${carrierLine}.` : ''}`;

    return brandReportEnvelope({ artifact, summary }, 'get_order_documents');
  },
};
