/**
 * Purchase-order IMPORT through the chat — a completeness loop over the PO
 * import field contract (`po-import-draft.ts`).
 *
 *  - `draft_po_import` (GREEN, no writes): lifts PO fields out of what the
 *    operator pasted or typed THIS turn (`ctx.userMessage` — the model never
 *    retypes it) plus any fields the model passes, resolves each item through
 *    the catalog (exact SKU, or the listing's item # via `sku_platform_ids`;
 *    titles by `resolveSkuIdentityTitle`), checks whether the PO number or a
 *    tracking number is already on the Incoming spine, and shows the inline
 *    PO card with its "Still needed" checklist. It UPDATES this thread's
 *    draft: each follow-up only adds what it says.
 *  - `import_purchase_order` (YELLOW): the confirm-before-write pattern of
 *    `create_manual_order`. `propose` files this thread's latest draft card as
 *    a `receiving.import_po` agent mutation and asks; the operator's "yes" on
 *    a LATER turn approves it through `reviewAgentMutation`, which lands every
 *    line through `ingestPurchase` (the Incoming desk's own path) and links the
 *    tracking to the PO's inbound carton for the arrival scan.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { askOnlyRefusal } from '@/lib/assistant/access-mode';
import { applyAgentMutation, reviewAgentMutation } from '@/lib/assistant/mutations/apply-agent-mutation';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactPoDraft, ArtifactRecord } from '@/lib/assistant/ui-artifacts';
import { PO_NUMBER_EXISTS_SQL } from '@/lib/inbound/import-po';
import {
  emptyPoImportDraft,
  extractPoFields,
  formatCostCents,
  mergePoDraft,
  poImportDraftSchema,
  poImportMissing,
  trackingEntry,
  type ExtractedPoItem,
  type PoImportDraft,
  type PoImportLine,
  type PoImportTracking,
} from '@/lib/inbound/po-import-draft';
import { CARTON_ORDER_LINKS_SQL, toCartonOrderLinks } from '@/lib/orders/po-order-link';
import { parseListingUrl } from '@/lib/inventory/listing-candidate';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { searchHitHref } from '@/lib/search/search-hit';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { resolveShipBy } from './manual-order-tools';
import { realConfirmableDeps } from './confirmable-write';
import { resolvePoOrderRefs } from './po-order-link-tools';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from './types';

export const DRAFT_PO_IMPORT_TOOL_NAME = 'draft_po_import';
export const IMPORT_PO_TOOL_NAME = 'import_purchase_order';
const KIND = 'receiving.import_po' as const;

type Rows = Array<Record<string, unknown>>;
type Query = (orgId: OrgId, text: string, params: ReadonlyArray<unknown>) => Promise<{ rows: Rows }>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// ─── catalog: SKU / listing item # → one catalog product ─────────────────────

/** Exact catalog SKU, punctuation-insensitive (the paperwork SKU key). */
const EXACT_SKU_SQL = `SELECT sc.id, sc.sku, i.name AS zoho_item_title, sc.product_title AS catalog_product_title
  FROM sku_catalog sc
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE sc.organization_id = $1 AND sc.is_active = true
   AND regexp_replace(UPPER(TRIM(sc.sku)), '[^A-Z0-9]', '', 'g') = regexp_replace(UPPER(TRIM($2::text)), '[^A-Z0-9]', '', 'g')
 ORDER BY sc.id
 LIMIT 1`;

/** The catalog product a marketplace listing is paired with (item # / ASIN). */
const LISTING_SKU_SQL = `SELECT sc.id, sc.sku, i.name AS zoho_item_title, sc.product_title AS catalog_product_title
  FROM sku_platform_ids sp
  JOIN sku_catalog sc ON sc.id = sp.sku_catalog_id AND sc.organization_id = sp.organization_id
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE sp.organization_id = $1 AND sp.is_active IS NOT FALSE AND sc.is_active = true
   AND UPPER(TRIM(sp.platform_item_id)) = UPPER(TRIM($2::text))
 ORDER BY sp.id
 LIMIT 1`;

/** Tracking numbers already linked to a receiving carton. */
const TRACKING_EXISTS_SQL = `SELECT stn.tracking_number_normalized AS tracking, MIN(sl.owner_id) AS receiving_id
  FROM shipping_tracking_numbers stn
  JOIN shipment_links sl
    ON sl.organization_id = stn.organization_id AND sl.shipment_id = stn.id AND sl.owner_type = 'RECEIVING'
 WHERE stn.organization_id = $1 AND stn.tracking_number_normalized = ANY($2::text[])
 GROUP BY stn.tracking_number_normalized`;

async function resolveLine(query: Query, orgId: OrgId, item: ExtractedPoItem, notes: string[]): Promise<PoImportLine> {
  const listing = item.listingUrl ? parseListingUrl(item.listingUrl) : null;
  const itemNumber = listing?.ok ? listing.candidate.itemNumber : '';
  const line: PoImportLine = {
    skuCatalogId: null,
    sku: item.sku ? item.product : '',
    title: item.sku ? '' : item.product,
    quantity: item.quantity,
    unitCostCents: item.unitCostCents,
    listingUrl: listing?.ok ? listing.candidate.listingUrl : '',
    itemNumber,
  };
  // A labelled SKU, else product words that happen to be a SKU, else the listing's pairing.
  const hit =
    (item.product ? (await query(orgId, EXACT_SKU_SQL, [orgId, item.product])).rows[0] : undefined) ??
    (itemNumber ? (await query(orgId, LISTING_SKU_SQL, [orgId, itemNumber])).rows[0] : undefined);
  if (hit) {
    const sku = str(hit.sku);
    line.skuCatalogId = Number(hit.id);
    line.sku = sku;
    line.title = resolveSkuIdentityTitle(hit as never) || sku;
  } else if (item.product) {
    notes.push(`${item.product} is not in the catalog — it imports by ${item.sku ? 'SKU' : 'title'}`);
  } else if (itemNumber) {
    line.title = `Listing ${itemNumber}`;
    notes.push(`Listing ${itemNumber} is not paired with a catalog SKU — it imports by item number`);
  }
  return line;
}

// ─── this thread's draft (the PO card the tool persisted) ────────────────────

/** The newest PO card from either tool — an import record means the draft was used. */
const LATEST_CARD_SQL = `SELECT a.value->>'producedBy' AS produced_by, a.value->'artifact' AS artifact
  FROM ai_chat_messages m
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(m.analysis->'artifacts') = 'array' THEN m.analysis->'artifacts' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS a(value, ord)
 WHERE m.organization_id = $1 AND m.session_id = $2 AND m.role = 'assistant' AND m.superseded_at IS NULL
   AND a.value->>'producedBy' IN ('${DRAFT_PO_IMPORT_TOOL_NAME}', '${IMPORT_PO_TOOL_NAME}')
 ORDER BY m.id DESC, a.ord DESC
 LIMIT 1`;

const cardSchema = z.object({ kind: z.literal('po_draft'), draft: poImportDraftSchema });

async function openDraft(query: Query, orgId: OrgId, sessionId: string | null | undefined): Promise<PoImportDraft | null> {
  if (!sessionId) return null;
  const row = (await query(orgId, LATEST_CARD_SQL, [orgId, sessionId])).rows[0];
  if (!row || row.produced_by !== DRAFT_PO_IMPORT_TOOL_NAME) return null;
  const parsed = cardSchema.safeParse(row.artifact);
  return parsed.success ? parsed.data.draft : null;
}

// ─── draft_po_import ─────────────────────────────────────────────────────────

const optionalText = (max: number) => z.string().trim().max(max).nullish();

const draftInput = z.object({
  newPo: z.boolean().nullish().describe('true ONLY when the user starts a second, different PO; default updates this conversation\'s draft.'),
  text: optionalText(8000).describe('Extra pasted PO text that is NOT in the user\'s message (the message itself is always read).'),
  poNumber: optionalText(120),
  vendor: optionalText(200),
  items: z
    .array(
      z.preprocess((raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
        const r = raw as Record<string, unknown>;
        return {
          product: r.product ?? r.sku ?? r.name ?? r.title ?? r.item,
          quantity: r.quantity ?? r.qty ?? r.count,
          unitCost: r.unitCost ?? r.unit_cost ?? r.cost ?? r.price,
          listingUrl: r.listingUrl ?? r.listing_url ?? r.listing ?? r.link ?? r.url,
        };
      }, z.object({
        product: z.string().trim().max(200).nullish().describe('A SKU, or the product words on the PO.'),
        quantity: z.coerce.number().int().min(1).max(9999).nullish(),
        unitCost: z
          .preprocess((v) => (typeof v === 'string' ? v.replace(/[^0-9.]/g, '') || undefined : v), z.coerce.number().min(0).max(1_000_000).nullish())
          .describe('Cost EACH in dollars, only when the PO says it.'),
        listingUrl: z.string().trim().max(600).nullish(),
      })),
    )
    .max(20)
    .nullish()
    .describe('ALL items on the PO — replaces the item list. Omit when only other fields changed.'),
  trackingNumbers: z.array(z.string().trim().min(4).max(60)).max(10).nullish(),
  expectedDate: optionalText(40).describe('As written: "Oct 3", "Friday", "10/3" or YYYY-MM-DD.'),
  notes: optionalText(1000),
  forOrders: z
    .array(z.string().trim().min(1).max(120))
    .max(10)
    .nullish()
    .describe('Outbound order #s this PO was bought FOR, as the user said them ("this PO is for order 1125"). Omit unless said.'),
  noOrder: z.boolean().nullish().describe('true only when the user says the PO is NOT for an order.'),
});

/**
 * A bare reply ("EVPO12345678", "Acme Audio") answers the question the card
 * asked first — the loop's follow-up rarely repeats its label.
 */
function bareAnswer(message: string, draft: PoImportDraft): { poNumber?: string; vendor?: string; tracking?: PoImportTracking; orderRef?: string } {
  const t = message.trim();
  if (!t || t.length > 80 || /\n/.test(t)) return {};
  for (const need of poImportMissing(draft)) {
    if (need.field === 'tracking') {
      const entry = /\s/.test(t) ? null : trackingEntry(t);
      if (entry) return { tracking: entry };
    } else if (need.field === 'po_number' && !/\s/.test(t) && /\d/.test(t)) {
      return { poNumber: t };
    } else if (need.field === 'order' && !/\s/.test(t) && /\d/.test(t)) {
      return { orderRef: t.replace(/^#/, '') };
    } else if (need.field === 'vendor' && !/\d{5,}/.test(t)) {
      return { vendor: t.replace(/^(?:it'?s|the vendor is|vendor is)\s+/i, '') };
    }
  }
  return {};
}

export const draftPoImport: AssistantToolDef<typeof draftInput, unknown> = {
  name: DRAFT_PO_IMPORT_TOOL_NAME,
  description:
    'IMPORT a PURCHASE ORDER (PO) the user pasted, typed or described — vendor PO, supplier confirmation, marketplace purchase: build or update this conversation\'s PO draft card (PO number, vendor, items with SKU or listing link, quantity and cost, tracking numbers, expected date, notes). The user\'s message is read automatically; pass only fields you are sure of. Call it again for every follow-up that answers what the card still needs (a tracking number, the PO number, a listing link…). Never invent a value. Do NOT call this when the user says import it / confirm — that is import_purchase_order with {"action":"propose"}.',
  permission: 'receiving.view',
  inputSchema: draftInput,
  run: async (input, ctx: AssistantToolCtx, deps: AssistantToolDeps) => {
    const org = ctx.organizationId;
    const query: Query = (orgId, text, params) => deps.query(orgId, text, params);
    const message = str(ctx.userMessage);
    const source = [message, input.text && !message.includes(input.text) ? input.text : ''].filter(Boolean).join('\n');
    const x = extractPoFields(source);
    const open = await openDraft(query, org, ctx.sessionId);
    // "New PO" only when a DIFFERENT PO number arrives — a model flagging a
    // follow-up as new would otherwise drop the draft it is completing.
    const saidPo = (input.poNumber ?? x.poNumber ?? '').trim().toUpperCase();
    const base = (input.newPo && open && saidPo && saidPo !== open.poNumber ? null : open) ?? emptyPoImportDraft();
    const notes: string[] = [];

    // Items: what the model listed wins over the text's lines — but a product
    // the text LABELLED as a SKU ("SKU 00066-P-2"), or the open draft already
    // carries as a SKU, stays a SKU, not a title.
    const labelledSkus = [...x.items.filter((i) => i.sku).map((i) => i.product), ...base.lines.map((l) => l.sku)]
      .filter(Boolean)
      .map((s) => s.toUpperCase());
    const said: ExtractedPoItem[] = input.items?.length
      ? input.items.map((i) => ({
          product: str(i.product),
          sku: labelledSkus.includes(str(i.product).toUpperCase()),
          quantity: i.quantity ?? null,
          unitCostCents: i.unitCost == null ? null : Math.round(i.unitCost * 100),
          listingUrl: str(i.listingUrl),
        }))
      : x.items;
    // Listing links alone (no SKU / words) attach to the lines already there.
    const linksOnly = said.length > 0 && said.every((i) => !i.product) && base.lines.length > 0;
    const resolved: PoImportLine[] = [];
    for (const item of said.filter((i) => i.product || i.listingUrl)) resolved.push(await resolveLine(query, org, item, notes));
    const listingLines: PoImportLine[] = [];
    for (const url of x.listingUrls) listingLines.push(await resolveLine(query, org, { product: '', sku: false, quantity: null, unitCostCents: null, listingUrl: url }, notes));

    const tracking = [
      ...(input.trackingNumbers ?? []).map((t) => trackingEntry(t, x.carrier)).filter((t): t is PoImportTracking => t != null),
      ...x.tracking,
    ];
    const expectedRaw = input.expectedDate ?? x.expected;
    const expectedDate = expectedRaw ? resolveShipBy(expectedRaw) : null;
    if (expectedRaw && !expectedDate) notes.push(`Expected date "${expectedRaw}" is not a date`);

    let draft = mergePoDraft(base, {
      poNumber: input.poNumber ?? x.poNumber,
      vendor: input.vendor ?? x.vendor,
      lines: linksOnly ? null : resolved,
      listingLines: linksOnly ? [...resolved, ...listingLines] : listingLines,
      lineQuantities: x.lineQuantities,
      tracking,
      expectedDate,
      notes: input.notes ?? x.notes,
    });
    const orderRefs = [...(input.forOrders ?? []), ...x.orderRefs];
    const nothingLifted =
      draft.poNumber === base.poNumber && draft.vendor === base.vendor && draft.tracking.length === base.tracking.length &&
      resolved.length === 0 && listingLines.length === 0 && x.lineQuantities.length === 0 && orderRefs.length === 0 && !x.noOrder;
    if (nothingLifted) {
      const answer = bareAnswer(message, draft);
      draft = mergePoDraft(draft, { poNumber: answer.poNumber, vendor: answer.vendor, tracking: answer.tracking ? [answer.tracking] : null });
      if (answer.orderRef) orderRefs.push(answer.orderRef);
    }
    // "This PO is for order 1125": each ref resolved identity-first; a miss stays on the card and Still needed asks.
    const clearOrders = Boolean(input.noOrder || x.noOrder);
    const forOrders = clearOrders || orderRefs.length === 0
      ? []
      : await resolvePoOrderRefs(ctx, [...new Set(orderRefs)], { find: realConfirmableDeps.find, query });
    draft = mergePoDraft(draft, { forOrders, clearOrders });

    const valid = poImportDraftSchema.safeParse(draft);
    if (!valid.success) {
      return { ok: false, error: `That PO could not be drafted: ${valid.error.issues[0]?.message ?? 'invalid field'}.` };
    }
    const d = valid.data;

    // Already on the Incoming spine?
    const duplicates: ArtifactPoDraft['duplicates'] = [];
    if (d.poNumber) {
      const taken = (await query(org, PO_NUMBER_EXISTS_SQL, [org, d.poNumber])).rows[0];
      if (taken) {
        const receivingId = taken.receiving_id == null ? null : Number(taken.receiving_id);
        duplicates.push({ field: 'po_number', value: d.poNumber, path: receivingId ? searchHitHref('RECEIVING', receivingId) : null });
      }
    }
    // A tracking hit on an already-imported PO is that PO's own carton — not news.
    if (d.tracking.length > 0 && duplicates.length === 0) {
      for (const row of (await query(org, TRACKING_EXISTS_SQL, [org, d.tracking.map((t) => t.number)])).rows) {
        duplicates.push({ field: 'tracking', value: str(row.tracking), path: searchHitHref('RECEIVING', Number(row.receiving_id)) });
      }
    }

    const missing = poImportMissing(d);
    const artifact: ArtifactPoDraft = {
      kind: 'po_draft',
      title: `PO ${d.poNumber || '(no number yet)'}${d.vendor ? ` · ${d.vendor}` : ''}`.slice(0, 120),
      draft: d,
      missing,
      duplicates,
      notes: notes.slice(0, 20),
    };

    const lineSentences = d.lines.map(
      (l) => `${l.quantity ?? '?'} × ${l.title || l.sku}${l.sku ? ` (${l.sku})` : ''}${l.unitCostCents != null ? ` at ${formatCostCents(l.unitCostCents, d.currency)} each` : ''}`,
    );
    const linkedOrders = d.forOrders.filter((o) => o.orderId != null);
    const poTaken = duplicates.some((x) => x.field === 'po_number');
    const summary = [
      `Draft PO ${d.poNumber || '(no number yet)'} from ${d.vendor || 'an unnamed vendor'}.`,
      lineSentences.length ? `Items: ${lineSentences.join('; ')}.` : 'No items yet.',
      d.tracking.length ? `Tracking: ${d.tracking.map((t) => t.number).join(', ')}.` : '',
      linkedOrders.length ? `For order ${linkedOrders.map((o) => o.orderNumber).join(', ')} — the import writes this link itself; never call link_po_to_order for this draft.` : '',
      poTaken ? `PO ${d.poNumber} is ALREADY imported — tell the user it exists (the card links to it) and do not import it again.${linkedOrders.length ? ` To tie it to order ${linkedOrders.map((o) => o.orderNumber).join(', ')}, call link_po_to_order {"po":"${d.poNumber}"}.` : ''}` : '',
      duplicates.filter((x) => x.field === 'tracking').map((x) => `Tracking ${x.value} is already on a receiving carton; this PO will join it.`).join(' '),
      !poTaken && missing.length > 0
        ? `Still needed: ${missing.map((m) => m.label).join(', ')}. The card is on screen — reply with exactly this and nothing else: "${missing.map((m) => m.question).join(' ')}"`
        : '',
      !poTaken && missing.length === 0
        ? message.length <= 40 && /\bimport\s+(?:it|this|that|the)\b/i.test(message)
          ? 'Nothing is missing and the user asked to import it: call import_purchase_order {"action":"propose"} now and reply with ONLY the question it returns.'
          : 'Nothing is missing. The card is on screen — tell the user to press Import (or say "import it"). Do not import it yourself.'
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    return brandReportEnvelope({ artifact, summary }, DRAFT_PO_IMPORT_TOOL_NAME);
  },
};

// ─── import_purchase_order ───────────────────────────────────────────────────

export interface PoImportToolDeps {
  query: Query;
  apply: typeof applyAgentMutation;
  review: typeof reviewAgentMutation;
  invalidate: (orgId: OrgId) => Promise<void>;
}

const realDeps: PoImportToolDeps = {
  query: async (orgId, text, params) => ({ rows: (await tenantQuery(orgId, text, [...params])).rows as Rows }),
  apply: applyAgentMutation,
  review: reviewAgentMutation,
  invalidate: (orgId) => invalidateReceivingViews(orgId),
};

const PENDING_SQL = `SELECT id, payload, created_at
  FROM agent_mutations
 WHERE organization_id = $1 AND ai_chat_session_id = $2
   AND mutation_kind = '${KIND}' AND status = 'proposed'
 ORDER BY id DESC`;

/** The imported PO's spine rows (manual source, this PO number), line order. */
const IMPORTED_LINES_SQL = `SELECT rl.id, rl.receiving_id, rl.sku, rl.item_name, rl.quantity_expected
  FROM inbound_purchase_order_links l
  JOIN receiving_line rl ON rl.id = l.receiving_line_id AND rl.organization_id = l.organization_id
 WHERE l.organization_id = $1 AND l.source_type = 'manual' AND l.source_order_id = $2
 ORDER BY l.source_line_item_id, rl.id`;

/**
 * The prompt line for a PO awaiting the operator's answer in this thread —
 * without it a "yes" on the next turn has nothing to attach to.
 */
export async function pendingPoImportNote(
  orgId: OrgId,
  sessionId: string,
  query: Query = realDeps.query,
): Promise<string | null> {
  const pending = (await query(orgId, PENDING_SQL, [orgId, sessionId])).rows[0];
  if (!pending) return null;
  const draft = poImportDraftSchema.safeParse((pending.payload as { draft?: unknown } | null)?.draft);
  const label = draft.success ? `PO ${draft.data.poNumber} from ${draft.data.vendor}` : 'a purchase order';
  return `PENDING CONFIRMATION: you proposed importing ${label} and asked the user to confirm. If this message says yes / confirm / import it, call ${IMPORT_PO_TOOL_NAME} with {"action":"confirm"} (no other arguments — the PO is remembered). If it says no / cancel, call it with {"action":"cancel"}.`;
}

const importInput = z.object({
  action: z
    .enum(['propose', 'confirm', 'cancel'])
    .default('propose')
    .describe('propose (default) files this conversation\'s PO draft for confirmation; confirm / cancel answer the pending one on a LATER turn.'),
});

export function buildImportPurchaseOrderTool(
  sessionId: string | null,
  /** When this turn began — a proposal at or after it is unconfirmable this turn. */
  turnStartedAt: Date,
  deps: PoImportToolDeps = realDeps,
): AssistantToolDef<typeof importInput, unknown> {
  const fail = (error: string) => ({ ok: false as const, error });

  const propose = async (ctx: AssistantToolCtx) => {
    if (!sessionId) return fail('No conversation to import from.');
    const draft = await openDraft(deps.query, ctx.organizationId, sessionId);
    if (!draft) {
      return fail(`There is no open PO draft in this conversation. Draft one first with ${DRAFT_PO_IMPORT_TOOL_NAME}. Nothing was imported.`);
    }
    const missing = poImportMissing(draft);
    if (missing.length > 0) {
      return fail(`Not ready to import — still needed: ${missing.map((m) => m.label).join(', ')}. Ask: "${missing.map((m) => m.question).join(' ')}" Nothing was imported.`);
    }
    if ((await deps.query(ctx.organizationId, PO_NUMBER_EXISTS_SQL, [ctx.organizationId, draft.poNumber])).rows[0]) {
      return fail(`PO ${draft.poNumber} is already imported. Nothing was imported.`);
    }
    // One open proposal per thread: an older one is superseded by this draft.
    for (const old of (await deps.query(ctx.organizationId, PENDING_SQL, [ctx.organizationId, sessionId])).rows) {
      await deps.review({
        organizationId: ctx.organizationId,
        mutationId: Number(old.id),
        decision: 'reject',
        actorStaffId: ctx.staffId,
        actorPermissions: ctx.permissions,
        notes: 'Superseded by a newer draft in the same conversation.',
        kinds: [KIND],
      });
    }
    const filed = await deps.apply({
      organizationId: ctx.organizationId,
      mutationKind: KIND,
      payload: { draft },
      proposedByStaffId: ctx.staffId,
      aiChatSessionId: sessionId,
    });
    if (!filed.ok) return fail(filed.error);
    const items = draft.lines.reduce((n, l) => n + (l.quantity ?? 0), 0);
    return {
      ok: true as const,
      status: 'needs_confirmation',
      mutationId: filed.mutationId,
      summary: `Not imported yet — waiting for the user's yes. Reply with exactly this question and nothing else: "Import PO ${draft.poNumber} from ${draft.vendor} — ${draft.lines.length} line${draft.lines.length === 1 ? '' : 's'}, ${items} unit${items === 1 ? '' : 's'}, tracking ${draft.tracking.map((t) => t.number).join(', ')}${draft.forOrders.length ? `, for order ${draft.forOrders.map((o) => o.orderNumber).join(', ')}` : ''}? Reply yes or no."`,
    };
  };

  const decide = async (ctx: AssistantToolCtx, decision: 'approve' | 'reject') => {
    if (!sessionId) return fail('No conversation to confirm in.');
    const pending = (await deps.query(ctx.organizationId, PENDING_SQL, [ctx.organizationId, sessionId])).rows[0];
    if (!pending) return fail('There is no PO waiting for confirmation in this conversation. Propose one first.');
    const mutationId = Number(pending.id);
    if (new Date(String(pending.created_at)).getTime() >= turnStartedAt.getTime()) {
      return fail('The user has not confirmed yet — this PO was proposed in this same turn. Ask them to confirm and wait for their reply. Nothing was imported.');
    }
    const proposed = poImportDraftSchema.safeParse((pending.payload as { draft?: unknown } | null)?.draft);
    const result = await deps.review({
      organizationId: ctx.organizationId,
      mutationId,
      decision,
      actorStaffId: ctx.staffId,
      actorPermissions: ctx.permissions,
      kinds: [KIND],
    });
    if (!result.ok) return fail(`${result.error}. Nothing was imported.`);
    if (decision === 'reject') {
      return { ok: true as const, status: 'cancelled', mutationId, summary: 'Cancelled — the PO was not imported.' };
    }

    const poNumber = String(result.targetRef ?? (proposed.success ? proposed.data.poNumber : ''));
    const rows = (await deps.query(ctx.organizationId, IMPORTED_LINES_SQL, [ctx.organizationId, poNumber])).rows;
    try {
      await deps.invalidate(ctx.organizationId);
    } catch (err) {
      console.warn('[import_purchase_order] receiving view invalidation failed (PO exists):', err);
    }
    const draft = proposed.success ? proposed.data : emptyPoImportDraft();
    const receivingId = rows.map((r) => r.receiving_id).find((v) => v != null);
    const cartonId = receivingId == null ? null : Number(receivingId);
    const units = rows.reduce((n, r) => n + Number(r.quantity_expected ?? 0), 0);
    const tracking = draft.tracking.map((t) => t.number).join(', ');
    // The link as it landed (read back), not as the draft asked for it.
    const forOrders = cartonId != null
      ? toCartonOrderLinks((await deps.query(ctx.organizationId, CARTON_ORDER_LINKS_SQL, [ctx.organizationId, cartonId])).rows)
      : [];
    const artifact: ArtifactRecord = {
      kind: 'record',
      title: `PO ${poNumber} imported${draft.vendor ? ` · ${draft.vendor}` : ''}`.slice(0, 120),
      path: cartonId != null ? searchHitHref('RECEIVING', cartonId) : `/receiving`,
      fields: [
        { label: 'PO', value: poNumber },
        { label: 'Vendor', value: draft.vendor || '—' },
        { label: 'Items', value: `${rows.length} line${rows.length === 1 ? '' : 's'} · ${units} unit${units === 1 ? '' : 's'} expected` },
        ...rows.slice(0, 8).map((r, i) => ({
          label: `Line ${i + 1}`,
          value: `${Number(r.quantity_expected)} × ${str(r.item_name) || str(r.sku)}${str(r.sku) ? ` (${str(r.sku)})` : ''}`.slice(0, 300),
        })),
        { label: 'Tracking', value: tracking || '—' },
        ...forOrders.slice(0, 4).map((o) => ({
          label: 'For order',
          value: `${o.orderNumber}${o.channel ? ` · ${o.channel}` : ''}`.slice(0, 300),
          ...(o.orderId != null ? { href: searchHitHref('ORDER', o.orderId) } : {}),
        })),
        ...(draft.expectedDate ? [{ label: 'Expected', value: draft.expectedDate }] : []),
        { label: 'Receiving', value: cartonId != null ? `Carton #${cartonId} · the arrival scan of the tracking opens it` : 'Waiting for a carton' },
        { label: 'Change', value: `#${mutationId}` },
      ].slice(0, 20),
      identity: {
        title: `PO ${poNumber}`,
        ...(draft.vendor ? { subtitle: draft.vendor } : {}),
        ids: [{ label: 'PO', value: poNumber.slice(0, 80) }, ...draft.tracking.slice(0, 4).map((t) => ({ label: 'Tracking' as const, value: t.number }))],
        ...(cartonId != null ? { href: searchHitHref('RECEIVING', cartonId) } : {}),
      },
    };
    const lineList = rows
      .slice(0, 8)
      .map((r) => `${str(r.sku) || str(r.item_name)} × ${Number(r.quantity_expected)}`)
      .join(', ');
    const summary = `Imported PO ${poNumber} from ${draft.vendor || 'the vendor'} — ${lineList} (${rows.length} line${rows.length === 1 ? '' : 's'}, ${units} unit${units === 1 ? '' : 's'}) expected on the Incoming list; tracking ${tracking} is linked, so scanning it at arrival opens this PO.${forOrders.length ? ` Linked to order ${forOrders.map((o) => o.orderNumber).join(', ')} — each record shows the other.` : ''}`;
    return brandReportEnvelope({ artifact, summary }, IMPORT_PO_TOOL_NAME);
  };

  return {
    name: IMPORT_PO_TOOL_NAME,
    description:
      'Import the purchase order ALREADY drafted in this conversation (the PO card) onto the Incoming list with its tracking linked for receiving — and the card\'s "For order" links, in the same write. Use only for the short command "Import this PO" / "import it" after a card exists; a pasted PO with details is draft_po_import. Two steps: action "propose" (no other arguments — the draft card is used as is) returns needs_confirmation — then ASK the user to confirm and stop (no link_po_to_order that turn). On their next message, "confirm" (yes) or "cancel" (no). Never confirm in the same turn you proposed.',
    permission: 'receiving.scan_po',
    inputSchema: importInput,
    run: async (input, ctx) => {
      if (ctx.accessMode === 'ask') return fail(askOnlyRefusal(IMPORT_PO_TOOL_NAME));
      if (input.action === 'propose') return propose(ctx);
      return decide(ctx, input.action === 'confirm' ? 'approve' : 'reject');
    },
  };
}
