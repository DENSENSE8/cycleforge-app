/**
 * Products › Import products CSV — the table-import descriptor (the shared
 * file picker, CSV reader and staging store) plus the one client call. The
 * plan is the server's (`POST /api/sku-catalog/import`): whether `1113` is
 * `01113` and whether a SKU is new depends on the catalog, so the Products
 * desk paints the server's answer rather than classifying in the browser.
 */

import type { TableImportDescriptor } from '@/lib/tables/import/types';
import type { TableImportDraft } from '@/lib/tables/import/staging-store';
import {
  autoMapCatalogImportHeaders,
  isRetiredTitle,
  type CatalogImportInputRow,
  type CatalogImportPlan,
} from './catalog-import';

export const CATALOG_IMPORT_SURFACE_ID = 'products-catalog-import';
export const PRODUCTS_DESK_PATH = '/products';

type CatalogImportField = keyof CatalogImportInputRow;

export interface CatalogImportRowView {
  index: number;
  sku: string;
  title: string;
}

const FIELDS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'title', label: 'Product title', required: true },
  { key: 'zohoItemId', label: 'Zoho item id', required: false },
  { key: 'upc', label: 'UPC', required: false },
  { key: 'ean', label: 'EAN', required: false },
] as const satisfies readonly { key: CatalogImportField; label: string; required: boolean }[];

const cell = (row: Record<string, string>, header: string | undefined) => (header ? (row[header] ?? '').trim() : '');

function project(row: Record<string, string>, mapping: Record<string, string>): Record<CatalogImportField, string> {
  return {
    sku: cell(row, mapping.sku),
    title: cell(row, mapping.title),
    zohoItemId: cell(row, mapping.zohoItemId),
    upc: cell(row, mapping.upc),
    ean: cell(row, mapping.ean),
  };
}

/** The staged file's rows, mapped — what the route plans and applies. */
export function catalogImportRowsOf(draft: Pick<TableImportDraft, 'rows' | 'mapping'>): CatalogImportInputRow[] {
  return draft.rows.map((row) => project(row, draft.mapping));
}

export interface CatalogImportResponse {
  plan: CatalogImportPlan;
  applied: { inserted: number; crosswalk: number } | null;
}

export async function postCatalogImport(rows: CatalogImportInputRow[], apply: boolean): Promise<CatalogImportResponse> {
  const res = await fetch('/api/sku-catalog/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rows, apply }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<CatalogImportResponse> & { error?: string; message?: string };
  if (!res.ok || !body.plan) throw new Error(body.error || body.message || `Import failed (HTTP ${res.status})`);
  return { plan: body.plan, applied: body.applied ?? null };
}

export const CATALOG_IMPORT_DESCRIPTOR: TableImportDescriptor<CatalogImportField, CatalogImportRowView> = {
  surfaceId: CATALOG_IMPORT_SURFACE_ID,
  entityNoun: 'products',
  deskPath: PRODUCTS_DESK_PATH,
  fields: FIELDS,
  autoMap: (headers) => autoMapCatalogImportHeaders(headers) as Record<string, string>,
  classify(row, mapping) {
    const values = project(row, mapping);
    const missing = FIELDS.filter((field) => field.required && !values[field.key]).map((field) => field.key);
    return { status: missing.length === 0 && !isRetiredTitle(values.title) ? 'ready' : 'action_required', missing };
  },
  project,
  applyEdits(row, mapping, edits) {
    const next = { ...row };
    for (const [field, value] of Object.entries(edits) as [CatalogImportField, string][]) {
      const header = mapping[field];
      if (header) next[header] = value;
    }
    return next;
  },
  toRowView(row, mapping, index) {
    const values = project(row, mapping);
    return { index, sku: values.sku, title: values.title };
  },
  searchValues: (view) => [view.sku, view.title],
  async commit({ rows, mapping }) {
    try {
      await postCatalogImport(catalogImportRowsOf({ rows, mapping }), true);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Import failed' };
    }
  },
};
