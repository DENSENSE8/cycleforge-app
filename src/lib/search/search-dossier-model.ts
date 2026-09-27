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
import {
  cartonExceptions,
  type CartonInspectorLine,
  type CartonInspectorReceiving,
  type CartonInspectorTotals,
} from '@/components/receiving/inspector/carton-inspector-model';
import { SHIPPING_EXCEPTIONS_PATH, shippingOrdersHref } from '@/lib/shipping/orders-desk';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
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
    // SKU identity law: the Zoho item title governs.
    const title = resolveSkuIdentityTitle(line) || `Line ${line.id}`;
    const expected = line.quantity_expected;
    const received = line.quantity_received;
    const finding =
      unmatched && !presentFact(line.zoho_purchaseorder_number)
        ? 'No matched PO'
        : expected != null && expected > 0 && (received ?? 0) === 0
          ? 'None received'
          : null;
    const facts: Array<{ label: string; value: string }> = [];
    const sku = presentFact(line.sku);
    if (sku) facts.push({ label: 'SKU', value: sku });
    if (expected != null || received != null) {
      facts.push({ label: 'Received', value: `${received ?? '—'} of ${expected ?? '—'}` });
    }
    const grade = presentFact(line.condition_grade);
    if (grade) facts.push({ label: 'Condition', value: grade });
    const bin = presentFact(line.location_code);
    if (bin) facts.push({ label: 'Bin', value: bin });
    const po = presentFact(line.zoho_purchaseorder_number);
    if (po) facts.push({ label: 'PO', value: po });
    return {
      id: line.id,
      title,
      imageUrl: presentFact(line.image_url),
      facts,
      links: (line.serials ?? []).map((serial) => ({
        id: `unit:${serial.id}`,
        label: 'Serial',
        value: serial.serial_number,
        target: { sel: { entityType: 'unit' as const, id: serial.id } },
      })),
      finding,
    };
  });
}
