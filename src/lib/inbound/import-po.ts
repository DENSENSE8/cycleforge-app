/**
 * Land a chat-drafted purchase order (`PoImportDraft`) through THE inbound
 * writer — `ingestInboundOrderInTx`, the same one the triage form, CSV and
 * sync use — on the CALLER's transaction client, so the agent-mutation
 * review applies it atomically with its audit row.
 *
 * The chat card's fields map onto the one `InboundOrderDraft`: PO number,
 * vendor, expected date, notes, currency, every tracking number, and each
 * line (catalog item, SKU / title, quantity, unit cost, listing, item #).
 * Lines are keyed L1..Ln; a re-apply is idempotent. The chat keeps its own
 * refusal: a PO number already on Incoming under ANY source is a 409.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import type { TxClient } from './purchase-links';
import type { PoImportDraft } from './po-import-draft';
import { emptyInboundOrderDraft, emptyInboundOrderLine, type InboundOrderDraft } from './inbound-order-draft';
import { ingestInboundOrderInTx, InboundOrderRefused } from './ingest-inbound-order';
import { linkPoToOrdersInTx } from '@/lib/orders/po-order-link';

export class PoImportRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409,
  ) {
    super(message);
  }
}

export interface PoImportResult {
  poNumber: string;
  receivingLineIds: number[];
  /** The PO's inbound carton — where the arrival scan lands. */
  receivingId: number | null;
}

/** Any spine row already carrying this PO number (any source, incl. a synced Zoho PO). */
export const PO_NUMBER_EXISTS_SQL = `SELECT rl.id AS receiving_line_id, rl.receiving_id
  FROM receiving_line rl
 WHERE rl.organization_id = $1
   AND (
     EXISTS (SELECT 1 FROM inbound_order io
              WHERE io.id = rl.inbound_order_id AND io.organization_id = rl.organization_id
                AND (io.external_order_id_norm = inbound_order_number_norm($2::text)
                     OR inbound_order_number_norm(io.order_number) = inbound_order_number_norm($2::text)))
     OR EXISTS (SELECT 1 FROM inbound_purchase_order_links l
              WHERE l.organization_id = rl.organization_id AND l.receiving_line_id = rl.id
                AND UPPER(TRIM(l.source_order_id)) = UPPER(TRIM($2::text)))
     OR EXISTS (SELECT 1 FROM receiving_line_zoho rz
                 WHERE rz.organization_id = rl.organization_id AND rz.receiving_line_id = rl.id
                   AND UPPER(TRIM(rz.zoho_purchaseorder_number)) = UPPER(TRIM($2::text)))
   )
 ORDER BY rl.id
 LIMIT 1`;

/** The chat card → the one inbound-order contract. */
export function inboundDraftFromPoImport(draft: PoImportDraft): InboundOrderDraft {
  return {
    ...emptyInboundOrderDraft('PO'),
    platform: 'manual',
    orderNumber: draft.poNumber.trim(),
    vendor: draft.vendor,
    expectedDate: draft.expectedDate,
    currency: draft.currency,
    notes: draft.notes,
    tracking: draft.tracking.map((t) => ({ number: t.number, carrier: t.carrier === 'Unknown' ? '' : t.carrier })),
    lines: draft.lines.map((l, i) => ({
      ...emptyInboundOrderLine(),
      lineKey: `L${i + 1}`,
      skuCatalogId: l.skuCatalogId,
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitCostCents: l.unitCostCents,
      listingUrl: l.listingUrl,
      itemNumber: l.itemNumber,
    })),
  };
}

export async function importPurchaseOrderInTx(
  client: TxClient,
  orgId: OrgId,
  draft: PoImportDraft,
  ingest: typeof ingestInboundOrderInTx = ingestInboundOrderInTx,
): Promise<PoImportResult> {
  const poNumber = draft.poNumber.trim();
  if (!poNumber) throw new PoImportRefused('PO number is required', 400);
  if (draft.lines.length === 0) throw new PoImportRefused('The PO has no items', 400);
  if (draft.tracking.length === 0) throw new PoImportRefused('A tracking number is required', 400);
  if (draft.lines.some((l) => l.quantity == null || (!l.sku && !l.title))) {
    throw new PoImportRefused('Every item needs a SKU or title and a quantity', 400);
  }
  const taken = await client.query(PO_NUMBER_EXISTS_SQL, [orgId, poNumber]);
  if (taken.rows.length > 0) throw new PoImportRefused(`PO ${poNumber} is already on the Incoming spine`, 409);
  if (draft.forOrders.some((o) => o.orderId == null)) {
    throw new PoImportRefused('Every order this PO is for must match an order', 400);
  }

  try {
    const landed = await ingest(client, orgId, inboundDraftFromPoImport(draft), {
      origin: 'chat',
      source: 'chat',
      staffId: null,
    });
    // "This PO is for order 1125" — the durable edge, in the same transaction.
    const forOrders = draft.forOrders.flatMap((o) =>
      o.orderId != null ? [{ orderNumber: o.orderNumber, localOrderId: o.orderId, channel: o.channel || null }] : [],
    );
    if (forOrders.length > 0) {
      await linkPoToOrdersInTx(client, orgId, { poNumber, inboundOrderId: landed.inboundOrderId, receivingId: landed.receivingId }, forOrders, 'po_import', null);
    }
    return {
      poNumber,
      receivingLineIds: landed.lines.map((l) => l.receivingLineId),
      receivingId: landed.receivingId,
    };
  } catch (err) {
    if (err instanceof InboundOrderRefused) throw new PoImportRefused(err.message, err.status === 409 ? 409 : 400);
    throw err;
  }
}
