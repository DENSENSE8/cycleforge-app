/**
 * Resolve what Show paints from the session cart + presentation pointer.
 * Never invents a second cart.
 */

import type { KioskCartLine, KioskLineType } from '@/lib/kiosk/cart-line';
import type { ConsultCatalogRef, ConsultPresentation } from '@/lib/counter/consult-stance';
import { lineIdentification } from '@/lib/kiosk/line-identification';

interface ConsultProposal {
  title: string;
  lineType: KioskLineType;
  identifierLabel: string;
  identifierValue: string;
  unitAmountCents: number;
  source: 'line' | 'catalog';
}

function proposalFromLine(line: KioskCartLine): ConsultProposal {
  const id = lineIdentification(line);
  return {
    title: line.title,
    lineType: line.type,
    identifierLabel: id.label,
    identifierValue: id.value,
    unitAmountCents: line.unitAmountCents * line.quantity,
    source: 'line',
  };
}

export function catalogRefFromPick(input: {
  title: string;
  lineType: ConsultCatalogRef['lineType'];
  sku?: string | null;
  unitAmountCents: number;
}): ConsultCatalogRef {
  return {
    title: input.title.trim() || '—',
    lineType: input.lineType,
    identifierLabel: 'SKU',
    identifierValue: input.sku?.trim() || '—',
    unitAmountCents: Math.max(0, Math.trunc(input.unitAmountCents) || 0),
  };
}

function proposalFromCatalog(catalog: ConsultCatalogRef): ConsultProposal {
  return {
    title: catalog.title,
    lineType: catalog.lineType,
    identifierLabel: catalog.identifierLabel,
    identifierValue: catalog.identifierValue,
    unitAmountCents: catalog.unitAmountCents,
    source: 'catalog',
  };
}

export function resolveConsultProposal(
  lines: readonly KioskCartLine[],
  presentation: ConsultPresentation,
): ConsultProposal | null {
  if (presentation.lineId) {
    const line = lines.find((l) => l.id === presentation.lineId);
    if (line) return proposalFromLine(line);
  }
  if (presentation.catalog) return proposalFromCatalog(presentation.catalog);
  return null;
}
