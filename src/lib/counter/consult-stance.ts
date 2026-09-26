/** Consult stances for the staff-guided iPad — Work · Show · Verify. */

export const CONSULT_STANCES = ['work', 'show', 'verify'] as const;

export type ConsultStance = (typeof CONSULT_STANCES)[number];

export function isConsultStance(value: string): value is ConsultStance {
  return (CONSULT_STANCES as readonly string[]).includes(value);
}

/** Work is the staff face; Show and Verify are customer-facing. */
export function faceFromConsultStance(stance: ConsultStance): 'staff' | 'customer' {
  return stance === 'work' ? 'staff' : 'customer';
}

/**
 * Recover a stance when only `face` was persisted (legacy `session.face_changed`).
 * Customer without a stance is Verify — that is what orientation used to mean.
 */
export function consultStanceFromFace(face: 'staff' | 'customer'): ConsultStance {
  return face === 'customer' ? 'verify' : 'work';
}

/** What Show paints — a cart line, or a catalog row that is not a line yet. */
export interface ConsultCatalogRef {
  title: string;
  lineType: 'RETAIL' | 'REPAIR' | 'BUYBACK';
  identifierLabel: string;
  identifierValue: string;
  unitAmountCents: number;
}

export interface ConsultPresentation {
  lineId: string | null;
  catalog: ConsultCatalogRef | null;
}

export const EMPTY_CONSULT_PRESENTATION: ConsultPresentation = {
  lineId: null,
  catalog: null,
};

export function parseConsultPresentation(raw: unknown): ConsultPresentation {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CONSULT_PRESENTATION };
  const rec = raw as { lineId?: unknown; catalog?: unknown };
  const lineId = typeof rec.lineId === 'string' && rec.lineId ? rec.lineId : null;
  const c = rec.catalog;
  if (!c || typeof c !== 'object') return { lineId, catalog: null };
  const cat = c as Record<string, unknown>;
  const title = typeof cat.title === 'string' ? cat.title : '';
  const lineType = cat.lineType;
  if (lineType !== 'RETAIL' && lineType !== 'REPAIR' && lineType !== 'BUYBACK') {
    return { lineId, catalog: null };
  }
  return {
    lineId,
    catalog: {
      title,
      lineType,
      identifierLabel: typeof cat.identifierLabel === 'string' ? cat.identifierLabel : 'SKU',
      identifierValue: typeof cat.identifierValue === 'string' ? cat.identifierValue : '—',
      unitAmountCents:
        typeof cat.unitAmountCents === 'number' && Number.isFinite(cat.unitAmountCents)
          ? Math.trunc(cat.unitAmountCents)
          : 0,
    },
  };
}
