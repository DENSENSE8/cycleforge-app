/** Print-packet facts — whether pack print has a shipping-label PDF and G2 paperwork (`g2-paperwork-sql.ts`), or a G2 exemption (order or SKU). */

import { G2_DOCUMENT_EXISTS_SQL, G2_SKU_PAPERWORK_NOT_REQUIRED_SQL } from './g2-paperwork-sql';

export const PAPERWORK_PARAM = 'paperwork';

interface PrintPacketFacts {
  hasShippingLabelDocument: boolean;
  linkedDocumentCount: number;
  /** `orders.docs_not_required` — the order-level G2 exemption. */
  docsNotRequired: boolean;
  /** `sku_catalog.paperwork_not_required` — the SKU-level G2 exemption. */
  skuPaperworkNotRequired: boolean;
}

export function isPrintPacketIncomplete(facts: PrintPacketFacts): boolean {
  if (!facts.hasShippingLabelDocument) return true;
  const exempt = facts.docsNotRequired || facts.skuPaperworkNotRequired;
  if (!exempt && facts.linkedDocumentCount < 1) return true;
  return false;
}

export function parsePaperworkOrderId(raw: string | null | undefined): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/*
 * The label fact is spelled as EXISTS probes that START from the org-led
 * entity indexes — document_entity_links (organization_id, entity_type,
 * entity_id) and documents (organization_id, entity_type, entity_id) — never
 * as a scan of the org's documents with a per-document link test. The scan
 * form made queue-counts' paperwork count 1.2 s (every order re-read every
 * document: phase0-findings §2.5). G2 is `G2_DOCUMENT_EXISTS_SQL`, the same
 * probe shape.
 */

/** The order has a shipping-label document: linked as ORDER, or a legacy `SHIPPING_LABEL` document row. */
export const PRINT_PACKET_LABEL_EXISTS_SQL = `(
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

/**
 * Predicate for the live To-ship working set: the print packet is missing a
 * shipping-label document, or G2 paperwork is empty without an exemption —
 * {@link isPrintPacketIncomplete} in SQL. Expects `o` = orders.
 */
export const PRINT_PACKET_INCOMPLETE_SQL = `(
  NOT ${PRINT_PACKET_LABEL_EXISTS_SQL}
  OR (
    COALESCE(o.docs_not_required, false) = false
    AND NOT ${G2_SKU_PAPERWORK_NOT_REQUIRED_SQL}
    AND NOT ${G2_DOCUMENT_EXISTS_SQL}
  )
)`;
