/**
 * Land a chat-drafted purchase order (`PoImportDraft`) on the Incoming spine —
 * the same `ingestPurchase` the desk Add and CSV import use (source `manual`,
 * receiving_type PO), run on the CALLER's transaction client so the
 * agent-mutation review applies it atomically with its audit row.
 *
 * One spine row per line (`source_line_item_id` `L1`, `L2`, … — a re-apply is
 * idempotent). Every tracking number is registered and linked to the PO's
 * inbound carton (keyed by org + manual + PO #), so the arrival scan of any of
 * them opens this PO. The mirror carries vendor, expected date, tracking and
 * the lines with their cost.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { upsertReceivingLineTesting } from '@/lib/receiving/facts/narrow';
import { ingestPurchase, type IngestPurchaseDeps } from './ingest-purchase';
import { upsertInboundMirror } from './mirror';
import { upsertPurchaseLink, type TxClient } from './purchase-links';
import type { PoImportDraft } from './po-import-draft';

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
     EXISTS (SELECT 1 FROM inbound_purchase_order_links l
              WHERE l.organization_id = rl.organization_id AND l.receiving_line_id = rl.id
                AND UPPER(TRIM(l.source_order_id)) = UPPER(TRIM($2::text)))
     OR EXISTS (SELECT 1 FROM receiving_line_zoho rz
                 WHERE rz.organization_id = rl.organization_id AND rz.receiving_line_id = rl.id
                   AND UPPER(TRIM(rz.zoho_purchaseorder_number)) = UPPER(TRIM($2::text)))
   )
 ORDER BY rl.id
 LIMIT 1`;

export async function importPurchaseOrderInTx(
  client: TxClient,
  orgId: OrgId,
  draft: PoImportDraft,
  ingest: typeof ingestPurchase = ingestPurchase,
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

  // Every write below shares this transaction (the review's own).
  const deps: IngestPurchaseDeps = {
    withTx: (_o, fn) => fn(client),
    upsertPurchaseLink,
    upsertInboundMirror,
    upsertReceivingLineTesting,
  };
  const lineItems = draft.lines.map((l, i) => ({
    lineItemId: `L${i + 1}`,
    sku: l.sku || null,
    title: l.title || null,
    skuCatalogId: l.skuCatalogId,
    quantity: l.quantity,
    unitCostCents: l.unitCostCents,
    listingUrl: l.listingUrl || null,
    itemNumber: l.itemNumber || null,
  }));
  const shared = {
    sourceType: 'manual',
    sourceOrderId: poNumber,
    orderNumber: poNumber,
    vendorOrSellerName: draft.vendor || null,
    sellerUsername: draft.vendor || null,
    status: 'ISSUED',
    expectedDeliveryDate: draft.expectedDate,
    lineItems,
    rawPayload: { via: 'assistant.po_import', currency: draft.currency, notes: draft.notes || null, tracking: draft.tracking },
  };
  const [first, ...more] = draft.tracking;

  const receivingLineIds: number[] = [];
  let receivingId: number | null = null;
  for (const [i, line] of draft.lines.entries()) {
    const r = await ingest(
      orgId,
      {
        ...shared,
        sourceLineItemId: `L${i + 1}`,
        sku: line.sku || null,
        itemName: line.title || null,
        skuCatalogId: line.skuCatalogId,
        quantityExpected: line.quantity ?? 1,
        listingUrl: line.listingUrl || null,
        trackingNumber: first.number,
        carrierCode: first.carrier === 'Unknown' ? null : first.carrier,
      },
      deps,
    );
    receivingLineIds.push(r.receivingLineId);
    receivingId ??= r.receivingId;
  }
  // A split shipment: each further number is linked to the same PO carton.
  for (const t of more) {
    const r = await ingest(
      orgId,
      {
        ...shared,
        sourceLineItemId: 'L1',
        sku: draft.lines[0].sku || null,
        itemName: draft.lines[0].title || null,
        trackingNumber: t.number,
        carrierCode: t.carrier === 'Unknown' ? null : t.carrier,
      },
      deps,
    );
    receivingId ??= r.receivingId;
  }
  return { poNumber, receivingLineIds, receivingId };
}
