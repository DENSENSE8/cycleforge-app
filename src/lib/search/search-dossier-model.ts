/**
 * Pure FIND view-models — hit lines, dossier facts, exception findings.
 *
 * Exception findings reuse the receiving carton exception vocabulary and the
 * order-exception blocker labels. Search paints them; it does not clear them.
 */

import type { AiSearchHit } from '@/lib/search/ai-search-client';
import {
  identityKindFor,
  orderIdFromHit,
  unitSerialFromHit,
} from '@/lib/search/search-result-identity';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  deriveOrderExceptionBlockers,
} from '@/lib/orders/order-exception-types';
import {
  cartonExceptions,
  type CartonInspectorLine,
  type CartonInspectorReceiving,
  type CartonInspectorTotals,
} from '@/components/receiving/inspector/carton-inspector-model';
import { SHIPPING_EXCEPTIONS_PATH, shippingOrdersHref } from '@/lib/shipping/orders-desk';

export const SEARCH_ENTITY_SINGULAR: Record<string, string> = {
  order: 'Order',
  unit: 'Unit',
  receiving: 'Carton',
  sku: 'SKU',
  repair: 'Repair',
  fba: 'FBA',
};

export type SearchHitIdentityKind = 'order' | 'serial' | 'empty';

export interface SearchHitLineView {
  entityLabel: string;
  title: string;
  identity: string;
  identityKind: SearchHitIdentityKind;
  whenSource: string | null;
  matchField: string;
  /** Exact-id hits often omit facets; the row must still paint. */
  sparse: boolean;
  status: string | null;
}

export function searchHitLineView(hit: AiSearchHit): SearchHitLineView {
  const orderId = orderIdFromHit(hit);
  const serial = unitSerialFromHit(hit);
  const tracking = hit.facets?.tracking_number?.trim() || '';
  const identityKind = identityKindFor(hit, orderId, serial, tracking || null);
  const identity =
    identityKind === 'order' ? orderId : identityKind === 'serial' ? serial : '';
  const facetValues = Object.values(hit.facets ?? {}).filter((v) => Boolean(v && String(v).trim()));
  return {
    entityLabel: SEARCH_ENTITY_SINGULAR[hit.entityType] ?? hit.entityType,
    title: hit.title?.trim() || identity || `${hit.entityType} #${hit.id}`,
    identity,
    identityKind,
    whenSource: hit.facets?.happened_at?.trim() || null,
    matchField: String(hit.matchField ?? '').trim(),
    sparse: facetValues.length === 0,
    status: hit.facets?.status?.trim() || null,
  };
}

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
}

export interface SearchDossierLine {
  id: string | number;
  title: string;
  meta: string;
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

export function joinMeta(parts: Array<string | null | undefined>): string {
  return parts.map((p) => String(p ?? '').trim()).filter(Boolean).join(' · ');
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

export function cartonDossierFindings(
  receiving: CartonInspectorReceiving,
  totals: CartonInspectorTotals | undefined | null,
  lines: ReadonlyArray<Pick<CartonInspectorLine, 'zoho_purchaseorder_number'>> | null,
): SearchDossierFinding[] {
  return cartonExceptions(receiving, totals, lines).map((ex) => ({
    key: ex.key,
    label: ex.label,
    hint: ex.ctaHint,
    href: '/unbox',
    hrefLabel: 'Open Unbox',
  }));
}

export function cartonDossierLines(
  lines: ReadonlyArray<CartonInspectorLine>,
  unmatched: boolean,
): SearchDossierLine[] {
  return lines.map((line) => {
    const title =
      presentFact(line.catalog_product_title) ||
      presentFact(line.zoho_item_title) ||
      presentFact(line.item_name) ||
      presentFact(line.sku) ||
      `Line ${line.id}`;
    const expected = line.quantity_expected;
    const received = line.quantity_received;
    const qty =
      expected != null || received != null
        ? `qty ${received ?? '—'} / ${expected ?? '—'}`
        : null;
    const finding =
      unmatched && !presentFact(line.zoho_purchaseorder_number)
        ? 'No matched PO'
        : expected != null && expected > 0 && (received ?? 0) === 0
          ? 'None received'
          : null;
    return {
      id: line.id,
      title,
      meta: joinMeta([line.sku, qty, line.condition_grade]),
      finding,
    };
  });
}
