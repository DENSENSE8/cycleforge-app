/** Print-packet facts — whether pack print has a shipping-label PDF and paperwork (manuals / non-label docs, or an explicit G2 exemption). */

export const PAPERWORK_PARAM = 'paperwork';

export interface PrintPacketFacts {
  hasShippingLabelDocument: boolean;
  linkedDocumentCount: number;
  docsNotRequired: boolean;
}

export function isPrintPacketIncomplete(facts: PrintPacketFacts): boolean {
  if (!facts.hasShippingLabelDocument) return true;
  if (!facts.docsNotRequired && facts.linkedDocumentCount < 1) return true;
  return false;
}

export function parsePaperworkOrderId(raw: string | null | undefined): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** @internal exported for tests that pin the SQL contract. */
export const PRINT_PACKET_G2_DOCUMENT_COUNT_SQL = `(
  SELECT COUNT(*)::int
    FROM documents d
   WHERE d.organization_id = o.organization_id
     AND COALESCE(d.document_type, '') <> 'shipping_label'
     AND EXISTS (
       SELECT 1
         FROM document_entity_links l
        WHERE l.document_id = d.id
          AND l.organization_id = o.organization_id
          AND (
            (l.entity_type = 'ORDER' AND l.entity_id = o.id)
            OR (o.sku_catalog_id IS NOT NULL
                AND l.entity_type = 'SKU'
                AND l.entity_id = o.sku_catalog_id)
          )
     )
)`;

/** @internal exported for tests that pin the SQL contract. */
export const PRINT_PACKET_LABEL_EXISTS_SQL = `EXISTS (
  SELECT 1
    FROM documents d
   WHERE d.organization_id = o.organization_id
     AND (
       (d.document_type = 'shipping_label' AND EXISTS (
          SELECT 1 FROM document_entity_links l
           WHERE l.document_id = d.id
             AND l.organization_id = o.organization_id
             AND l.entity_type = 'ORDER'
             AND l.entity_id = o.id
        ))
       OR (d.entity_type = 'SHIPPING_LABEL' AND d.entity_id = o.id)
     )
)`;

/**
 * Predicate for the live To-ship working set: the print packet is missing a
 * shipping-label document, or G2 paperwork is empty without an exemption.
 * Uses the same `o` alias as `/api/orders/queue-counts`.
 */
export const PRINT_PACKET_INCOMPLETE_SQL = `(
  NOT ${PRINT_PACKET_LABEL_EXISTS_SQL}
  OR (
    COALESCE(o.docs_not_required, false) = false
    AND ${PRINT_PACKET_G2_DOCUMENT_COUNT_SQL} = 0
  )
)`;
