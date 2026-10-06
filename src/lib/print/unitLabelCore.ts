import { encodePrintMatrix } from '@/lib/qr/platform-link';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { CONDITION_GRADES, conditionLabel } from '@/lib/conditions';

function conditionChipLabel(grade: string | null | undefined): string {
  const c = String(grade ?? '').trim().toUpperCase();
  if (!(CONDITION_GRADES as readonly string[]).includes(c)) return '';
  return conditionLabel(c, 'label');
}

/**
 * Unit matrix — thin adapter over the encode SoT ({@link encodePrintMatrix}).
 * Every unit path (workspace preview, face, HTML print, raw TSPL/ZPL) goes
 * through here, so the sticker and the on-screen preview cannot disagree.
 */
export function buildUnitPayload(args: {
  sku: string;
  serialNumber: string | null;
  qrPayload?: string | null;
  gtin?: string | null;
  /** When set with GTIN, mint platform Digital Link URL on `{slug}.app…`. */
  orgSlug?: string | null;
}): { value: string; symbology: 'gs1datamatrix' | 'datamatrix' } {
  const { value, symbology } = encodePrintMatrix({
    kind: 'unit',
    orgSlug: args.orgSlug,
    sku: args.sku,
    serialNumber: args.serialNumber,
    gtin: args.gtin,
    override: args.qrPayload,
  });
  return { value, symbology };
}

export type PrintProductLabelInput = {
  sku: string;
  title?: string;
  serialNumber?: string;
  qrPayload?: string;
  gtin?: string;
  orgSlug?: string | null;
  condition?: string | null;
  color?: string | null;
  /** Custom line under the title (the face's centre); empty hides it. */
  note?: string | null;
  /** Serial units under this label — a package of N≥2 says so on the face. */
  serialCount?: number | null;
};

export function unitLabelToFace(input: {
  sku: string;
  title?: string | null;
  serialNumber?: string | null;
  condition?: string | null;
  color?: string | null;
  note?: string | null;
  serialCount?: number | null;
  matrix: LabelFaceModel['matrix'];
}): LabelFaceModel {
  const title = (input.title ?? '').trim();
  const serialCount = input.serialCount ?? 0;
  return {
    kind: 'product',
    topLeft: title || input.sku,
    topRight: '',
    center: (input.note ?? '').trim(),
    bottomLeft: conditionChipLabel(input.condition),
    bottomRight: [(input.color ?? '').trim(), serialCount > 1 ? `${serialCount} serials` : '']
      .filter(Boolean)
      .join(' · '),
    matrix: input.matrix,
  };
}

export function productLabelFace(input: PrintProductLabelInput) {
  const sku = input.sku?.trim();
  if (!sku) return null;
  const matrix = {
    ...buildUnitPayload({
      sku,
      serialNumber: input.serialNumber?.trim() || null,
      qrPayload: input.qrPayload?.trim() || null,
      gtin: input.gtin?.trim() || null,
      orgSlug: input.orgSlug,
    }),
    scale: 4,
  };
  const face = unitLabelToFace({
    sku,
    title: input.title,
    serialNumber: input.serialNumber,
    condition: input.condition,
    color: input.color,
    note: input.note,
    serialCount: input.serialCount,
    matrix,
  });
  return { sku, matrix, face, ...buildFaceInfoHtml(face) };
}
