/** Print-packet facts — whether pack print has a shipping-label PDF and paperwork (manuals / non-label docs, or an explicit G2 exemption). */

export const PAPERWORK_PARAM = 'paperwork';

interface PrintPacketFacts {
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

/*
 * Both facts are spelled as EXISTS probes that START from the org-led entity
 * indexes — document_entity_links (organization_id, entity_type, entity_id)
 * and documents (organization_id, entity_type, entity_id) — never as a scan
 * of the org's documents with a per-document link test. The scan form made
 * queue-counts' paperwork count 1.2 s (every order re-read every document:
 * phase0-findings §2.5); these probes return the same set.
 */

/** The order has a shipping-label document: linked as ORDER, or a legacy `SHIPPING_LABEL` document row. */
const PRINT_PACKET_LABEL_EXISTS_SQL = `(
  EXISTS (
    SELECT 1
      FROM document_entity_links l
      JOIN documents d
        ON d.id = l.document_id
       AND d.organization_id = l.organization_id
     WHERE l.organization_id = o.organization_id
       AND l.entity_type = 'ORDER'
       AND l.entity_id = o.id
       AND d.document_type = 'shipping_label'
  )
  OR EXISTS (
    SELECT 1
      FROM documents d
     WHERE d.organization_id = o.organization_id
       AND d.entity_type = 'SHIPPING_LABEL'
       AND d.entity_id = o.id
  )
)`;

/** G2 paperwork: a non-label document linked to the order or to its catalog SKU. */
const PRINT_PACKET_G2_DOCUMENT_EXISTS_SQL = `EXISTS (
  SELECT 1
    FROM document_entity_links l
    JOIN documents d
      ON d.id = l.document_id
     AND d.organization_id = l.organization_id
   WHERE l.organization_id = o.organization_id
     AND (
       (l.entity_type = 'ORDER' AND l.entity_id = o.id)
       OR (o.sku_catalog_id IS NOT NULL
           AND l.entity_type = 'SKU'
           AND l.entity_id = o.sku_catalog_id)
     )
     AND COALESCE(d.document_type, '') <> 'shipping_label'
)`;

/**
 * Predicate for the live To-ship working set: the print packet is missing a
 * shipping-label document, or G2 paperwork is empty without an exemption —
 * {@link isPrintPacketIncomplete} in SQL. Expects `o` = orders.
 */
export const PRINT_PACKET_INCOMPLETE_SQL = `(
  NOT ${PRINT_PACKET_LABEL_EXISTS_SQL}
  OR (
    COALESCE(o.docs_not_required, false) = false
    AND NOT ${PRINT_PACKET_G2_DOCUMENT_EXISTS_SQL}
  )
)`;
