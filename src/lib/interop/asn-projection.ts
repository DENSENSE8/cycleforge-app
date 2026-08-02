/**
 * EDI 856 (Advance Ship Notice) projection — the HL hierarchy as JSON.
 *
 * Pure over its injected read surface. Writes nothing; every level below is a
 * row that already exists.
 *
 * ## Why JSON and not X12
 *
 * Cycle Forge is not an EDI VAN and must not grow a segment serializer.
 * Every customer that speaks 856 already owns a translator, and those
 * translators take structured JSON — so emitting X12 here would mean building
 * and maintaining a second integration surface (envelopes, ISA/GS control
 * numbers, partner-specific qualifiers, acknowledgement handling) forever, to
 * produce something the partner would immediately re-parse. The HL hierarchy
 * IS the document's content; the envelope is transport.
 *
 * ## The mapping is near-1:1, which is why this needs no migration
 *
 *   HL*S  Shipment  ← `shipping_tracking_numbers` (the carrier tracking row)
 *   HL*O  Order     ← the distinct PO numbers among that shipment's cartons
 *   HL*P  Pack      ← `receiving_carton`
 *   HL*I  Item      ← `receiving_line`
 *
 * ## The shape is derived, never configured
 *
 * A shipment whose cartons carry lines is `SOPI`; one with lines but no
 * carton breakdown is `SOI`. Emitting `SOPI` for the latter would invent a
 * pack level, which is a claim about how the goods are physically packed —
 * exactly the kind of plausible fabrication a partner's receiving dock would
 * act on. `SOTI` / `SOTPI` are in the vocabulary but unreachable here:
 * nothing in Cycle Forge models a pallet, so `hasTare` is always false and
 * the day a tare fact exists is the day this passes `true`.
 *
 * ## SSCC is absent, deliberately
 *
 * The Pack level's natural key is an SSCC, and `receiving_carton` has no such
 * column — its only handle is `id`. Minting one would require a licensed GS1
 * Company Prefix the tenant almost certainly does not have, and a fabricated
 * SSCC collides with a real company's licensed range. So a pack carries an
 * internal `urn:cycleforge:carton:{id}` and the `sscc` field is omitted. The
 * moment a tenant configures a prefix AND a real SSCC has somewhere to live,
 * this upgrades without touching the hierarchy.
 */

import {
  numberAsnHierarchy,
  resolveAsnShape,
  type AsnHlNode,
  type AsnShape,
  EDI_856_MAX_HL_LOOPS,
} from './edi-hierarchy';
import {
  gtinIdentifier,
  hasCompanyPrefix,
  internalIdentifier,
  type Gs1OrgIdentity,
} from './gs1-keys';

/** The carrier-tracking row that roots the document. */
export interface AsnShipmentRow {
  id: number;
  tracking_number_raw: string | null;
  carrier: string | null;
  latest_status_category: string | null;
  delivered_at: Date | string | null;
  label_created_at: Date | string | null;
}

/** One carton on that shipment. */
export interface AsnCartonRow {
  id: number;
  zoho_purchaseorder_number: string | null;
  carrier: string | null;
  receiving_date_time: Date | string | null;
}

/** One line inside a carton. */
export interface AsnLineRow {
  id: number;
  receiving_id: number | null;
  sku: string | null;
  item_name: string | null;
  quantity: number | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  workflow_status: string | null;
  /** `sku_catalog.gtin`, reached ONLY via `sku_catalog_id` — never a SKU-string join. */
  gtin: string | null;
}

export interface AsnProjectionDeps {
  fetchShipment: (args: { orgId: string; shipmentId: number }) => Promise<AsnShipmentRow | null>;
  fetchCartons: (args: { orgId: string; shipmentId: number }) => Promise<AsnCartonRow[]>;
  fetchLines: (args: { orgId: string; cartonIds: number[] }) => Promise<AsnLineRow[]>;
}

export interface AsnDocument {
  shape: AsnShape;
  /** Total HL loops. An 856 caps at 200,000. */
  hlCount: number;
  /** True when the hierarchy exceeds what a single 856 may carry. */
  exceedsSingleDocument: boolean;
  hierarchy: AsnHlNode;
  meta: {
    /**
     * Why an SSCC is missing from every Pack node. Present whenever it is,
     * so a consumer is told rather than left to wonder.
     */
    ssccOmittedReason?: string;
    /** Lines that could not be attributed to a carton, if any. */
    orphanLineCount: number;
  };
}

const iso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Build the ASN for one shipment.
 *
 * Returns `null` when the shipment does not exist for this org — the route
 * turns that into a 404 rather than an empty document, because an empty
 * document asserts "this shipment contains nothing", which is a different and
 * false claim.
 */
export async function projectAsn(
  args: { orgId: string; shipmentId: number; identity: Gs1OrgIdentity },
  deps: AsnProjectionDeps,
): Promise<AsnDocument | null> {
  const shipment = await deps.fetchShipment({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
  });
  if (!shipment) return null;

  const cartons = await deps.fetchCartons({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
  });
  const lines = cartons.length
    ? await deps.fetchLines({ orgId: args.orgId, cartonIds: cartons.map((c) => c.id) })
    : [];

  const linesByCarton = new Map<number, AsnLineRow[]>();
  let orphanLineCount = 0;
  for (const line of lines) {
    if (line.receiving_id == null) {
      orphanLineCount++;
      continue;
    }
    const bucket = linesByCarton.get(line.receiving_id);
    if (bucket) bucket.push(line);
    else linesByCarton.set(line.receiving_id, [line]);
  }

  const itemNode = (line: AsnLineRow): AsnHlNode => {
    const gtin = gtinIdentifier(line.gtin);
    return {
      id: 0,
      parentId: null,
      level: 'I',
      children: [],
      detail: {
        lineId: line.id,
        id: internalIdentifier('line', line.id).uri,
        sku: line.sku,
        description: line.item_name,
        // Both numbers, because "expected" and "received" answer different
        // questions and an ASN that reports only one hides every discrepancy
        // the receiving dock exists to catch.
        quantityExpected: line.quantity_expected ?? line.quantity ?? null,
        quantityReceived: line.quantity_received ?? null,
        workflowStatus: line.workflow_status,
        ...(gtin ? { gtin: gtin.value, gtinUri: gtin.uri } : {}),
      },
    };
  };

  // Group cartons by PO — the Order level. A carton with no PO number is real
  // (an unmatched arrival), and it groups under an explicit null bucket rather
  // than being dropped or assigned to an arbitrary neighbour.
  const cartonsByPo = new Map<string | null, AsnCartonRow[]>();
  for (const carton of cartons) {
    const key = carton.zoho_purchaseorder_number?.trim() || null;
    const bucket = cartonsByPo.get(key);
    if (bucket) bucket.push(carton);
    else cartonsByPo.set(key, [carton]);
  }

  const hasPack = cartons.length > 0;
  const shape = resolveAsnShape({ hasTare: false, hasPack });

  const orderNodes: AsnHlNode[] = [];
  for (const [po, poCartons] of cartonsByPo) {
    const packNodes: AsnHlNode[] = poCartons.map((carton) => ({
      id: 0,
      parentId: null,
      level: 'P' as const,
      children: (linesByCarton.get(carton.id) ?? []).map(itemNode),
      detail: {
        cartonId: carton.id,
        id: internalIdentifier('carton', carton.id).uri,
        carrier: carton.carrier,
        receivedAt: iso(carton.receiving_date_time),
        // `sscc` is deliberately absent — see the module docblock.
      },
    }));

    orderNodes.push({
      id: 0,
      parentId: null,
      level: 'O',
      children: shape === 'SOI' ? packNodes.flatMap((p) => p.children) : packNodes,
      detail: {
        purchaseOrderNumber: po,
        ...(po ? { id: internalIdentifier('order', po).uri } : {}),
        ...(po ? {} : { note: 'Carton not matched to a purchase order at projection time.' }),
      },
    });
  }

  const root: AsnHlNode = {
    id: 0,
    parentId: null,
    level: 'S',
    children: orderNodes,
    detail: {
      shipmentId: shipment.id,
      id: internalIdentifier('shipment', shipment.id).uri,
      trackingNumber: shipment.tracking_number_raw,
      carrier: shipment.carrier,
      statusCategory: shipment.latest_status_category,
      shippedAt: iso(shipment.label_created_at),
      deliveredAt: iso(shipment.delivered_at),
    },
  };

  const hlCount = numberAsnHierarchy(root);

  return {
    shape,
    hlCount,
    exceedsSingleDocument: hlCount > EDI_856_MAX_HL_LOOPS,
    hierarchy: root,
    meta: {
      ...(hasPack
        ? {
            ssccOmittedReason: hasCompanyPrefix(args.identity)
              ? 'No SSCC is stored against a carton; receiving_carton has no SSCC column. Packs carry an internal identifier.'
              : 'This organization has no licensed GS1 Company Prefix configured, so an SSCC cannot be minted. Packs carry an internal identifier.',
          }
        : {}),
      orphanLineCount,
    },
  };
}
