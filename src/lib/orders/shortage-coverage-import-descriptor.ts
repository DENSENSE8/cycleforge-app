/**
 * The **shortage-coverage** table-import descriptor.
 *
 * Family-specific: Amazon OOS demand rows, Ready / Action-required from
 * {@link classifyCsvShortageCoverageRow}, coverage face from
 * {@link formatShortageCoverage}. The mechanism (parse · stage · select ·
 * confirm) is `src/lib/tables/import/`. Confirm attaches coverage to an
 * existing order — it does not mint.
 */

import {
  CSV_SHORTAGE_COVERAGE_FIELDS,
  applyCsvShortageCoverageCanonicalEdits,
  autoMapCsvShortageCoverageHeaders,
  classifyCsvShortageCoverageRow,
  formatProjectedShortageCoverage,
  postCsvShortageCoverageImport,
  projectCsvShortageCoverageRow,
  type CsvShortageCoverageKey,
  type CsvShortageCoverageRowStatus,
} from '@/lib/orders/csv-shortage-coverage-import';
import { SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';
import type { TableImportDescriptor } from '@/lib/tables/import/types';

export type ShortageCoverageImportRowView = {
  index: number;
  status: CsvShortageCoverageRowStatus;
  missing: CsvShortageCoverageKey[];
  /** Same-file order+SKU collision — Confirm would skip this extra row. */
  duplicate: boolean;
  orderNumber: string;
  sku: string;
  itemNumber: string;
  itemTitle: string;
  shortQty: string;
  shipByDate: string;
  poNumber: string;
  inboundTracking: string;
  eta: string;
  /** SoT face — staging Coverage column and live Shortage row share this. */
  coverageLabel: string;
};

export const SHORTAGE_COVERAGE_IMPORT_SURFACE_ID = 'shortage-coverage-import';

export const SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR: TableImportDescriptor<
  CsvShortageCoverageKey,
  ShortageCoverageImportRowView
> = {
  surfaceId: SHORTAGE_COVERAGE_IMPORT_SURFACE_ID,
  entityNoun: 'shortages',
  deskPath: SHIPPING_SHORTAGE_PATH,
  fields: CSV_SHORTAGE_COVERAGE_FIELDS,
  autoMap: autoMapCsvShortageCoverageHeaders,
  classify: classifyCsvShortageCoverageRow,
  project: projectCsvShortageCoverageRow,
  applyEdits: applyCsvShortageCoverageCanonicalEdits,
  toRowView(row, mapping, index) {
    const { status, missing } = classifyCsvShortageCoverageRow(row, mapping);
    const projected = projectCsvShortageCoverageRow(row, mapping);
    return {
      index,
      status,
      missing,
      duplicate: false,
      orderNumber: projected.order_number,
      sku: projected.sku,
      itemNumber: projected.item_number,
      itemTitle: projected.item_title,
      shortQty: projected.short_qty,
      shipByDate: projected.ship_by_date,
      poNumber: projected.po_number,
      inboundTracking: projected.inbound_tracking,
      eta: projected.eta,
      coverageLabel: formatProjectedShortageCoverage(projected),
    };
  },
  searchValues(view) {
    return [
      view.orderNumber,
      view.sku,
      view.itemNumber,
      view.itemTitle,
      view.shortQty,
      view.poNumber,
      view.inboundTracking,
      view.eta,
      view.coverageLabel,
    ];
  },
  async commit({ rows, mapping }) {
    const outcome = await postCsvShortageCoverageImport({ rows, mapping });
    return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
  },
};

/** Flag later same-file order+SKU collisions after the per-row classify. */
export function markShortageCoverageDuplicates(
  views: ShortageCoverageImportRowView[],
): ShortageCoverageImportRowView[] {
  const firstAt = new Map<string, number>();
  const dupKeys = new Set<string>();
  for (const view of views) {
    const order = view.orderNumber.trim();
    const sku = view.sku.trim();
    if (!order || !sku) continue;
    const key = `${order}\u0000${sku}`;
    if (firstAt.has(key)) dupKeys.add(key);
    else firstAt.set(key, view.index);
  }
  if (dupKeys.size === 0) return views;
  return views.map((view) => {
    const key = `${view.orderNumber.trim()}\u0000${view.sku.trim()}`;
    if (!dupKeys.has(key)) return view;
    const first = firstAt.get(key);
    if (first === view.index) return view;
    return {
      ...view,
      duplicate: true,
      status: 'action_required',
      missing: view.missing.includes('sku') ? view.missing : [...view.missing, 'sku'],
    };
  });
}

/** Batch counts — same classify + duplicate pass the grid Confirm uses. */
export function summarizeShortageCoverageDraft(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): { total: number; ready: number; actionRequired: number } {
  const marked = markShortageCoverageDuplicates(
    rows.map((row, index) =>
      SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR.toRowView(row, mapping, index),
    ),
  );
  const ready = marked.filter((v) => v.status === 'ready').length;
  return { total: marked.length, ready, actionRequired: marked.length - ready };
}
