/**
 * Pure FIND view-models — hit lines, dossier facts, exception findings.
 *
 * Exception findings reuse the receiving carton exception vocabulary and the
 * order-exception blocker labels. Search paints them; it does not clear them.
 */

import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  deriveOrderExceptionBlockers,
} from '@/lib/orders/order-exception-types';
import { SHIPPING_EXCEPTIONS_PATH, shippingOrdersHref } from '@/lib/shipping/orders-desk';
import type { SearchSelection } from '@/lib/search/search-selection';

export interface SearchDossierFinding {
  key: string;
  label: string;
  hint: string;
  href?: string;
  hrefLabel?: string;
}

export interface SearchDossierFact {
  id: string;
  label: string;
  value: string;
  /** An identifier (serial, tracking, PO, SKU) — painted in full, click copies. */
  copy?: boolean;
}

/** Where a related-record link lands: another `/search` record, or a query. */
export type SearchDossierTarget =
  | { sel: SearchSelection }
  | { query: string };

/** A record this one points at (the order a unit shipped on, the PO a carton came from). */
export interface SearchDossierLink {
  id: string;
  label: string;
  value: string;
  target: SearchDossierTarget;
}

/** One thing the record holds — a carton line, the unit itself, the catalog item. */
export interface SearchDossierLine {
  id: string | number;
  title: string;
  imageUrl?: string | null;
  facts: ReadonlyArray<{ label: string; value: string }>;
  /** Records the line points at (its serial units, …). */
  links?: readonly SearchDossierLink[];
  finding?: string | null;
}

export interface SearchDossierHandoff {
  href: string;
  label: string;
  primary?: boolean;
}

export function presentFact(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim();
  return v || null;
}

export function orderDossierFindings(order: {
  id: number;
  item_number?: string | null;
  sku?: string | null;
  sku_catalog_id?: number | null;
}): SearchDossierFinding[] {
  const findings: SearchDossierFinding[] = [];
  const blockers = deriveOrderExceptionBlockers({
    itemNumber: order.item_number,
    skuCatalogId: order.sku_catalog_id ?? null,
  });
  const exceptionsHref = `${SHIPPING_EXCEPTIONS_PATH}?order=${order.id}`;
  for (const blocker of blockers) {
    findings.push({
      key: blocker,
      label: ORDER_EXCEPTION_BLOCKER_LABEL[blocker],
      hint: 'Clear this on the exceptions desk. Search does not write pairing.',
      href: exceptionsHref,
      hrefLabel: 'Open exceptions',
    });
  }
  if (!presentFact(order.sku) && !blockers.includes('unpaired')) {
    findings.push({
      key: 'no_sku',
      label: 'No SKU',
      hint: 'This order has no SKU to pack against.',
      href: exceptionsHref,
      hrefLabel: 'Open exceptions',
    });
  }
  return findings;
}

export function orderDossierHandoffs(orderId: number, hasFindings: boolean): SearchDossierHandoff[] {
  const exceptions: SearchDossierHandoff = {
    href: `${SHIPPING_EXCEPTIONS_PATH}?order=${orderId}`,
    label: 'Open exceptions',
    primary: hasFindings,
  };
  const desk: SearchDossierHandoff = {
    href: shippingOrdersHref({ openOrderId: orderId }),
    label: 'Open on To-ship',
    primary: !hasFindings,
  };
  return hasFindings ? [exceptions, desk] : [desk];
}
