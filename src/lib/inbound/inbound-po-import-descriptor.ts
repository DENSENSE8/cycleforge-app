/**
 * Incoming purchase-order table-import descriptor — bulk PO CSV (Goodwill and
 * any platform without an API) on the shared staging framework.
 *
 * Column binding is `identifyColumns` (header words, then value shape); row
 * readiness is `poRowToDeskRow`'s problems, so the grid flags exactly what the
 * server would hold. The platform pick (one per draft) lives in a tiny store
 * here because readiness depends on its preset (Goodwill: one item per row
 * when the file has no quantity column).
 */

import { useSyncExternalStore } from 'react';
import { INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import type { TableImportDescriptor } from '@/lib/tables/import/types';
import {
  PO_COLUMNS,
  PO_FIELDS,
  identifyColumns,
  poPresetForPlatform,
  poRowToDeskRow,
  suggestPoPlatform,
  type PoField,
  type PoRowContext,
} from './po-columns';
import { postPoCsvImport } from './po-csv-client';

export type InboundPoImportRowView = {
  index: number;
  status: 'ready' | 'action_required';
  missing: PoField[];
  problems: string[];
  orderNumber: string;
  title: string;
  sku: string;
  quantity: string;
  unitCost: string;
  tracking: string;
  itemId: string;
};

// ─── platform pick ───────────────────────────────────────────────────────────

/** Goodwill is the platform this import exists for (no purchase API). */
let platform = 'goodwill';
const listeners = new Set<() => void>();

export function getPoImportPlatform(): string {
  return platform;
}

export function setPoImportPlatform(next: string): void {
  if (next === platform) return;
  platform = next;
  listeners.forEach((l) => l());
}

export function usePoImportPlatform(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getPoImportPlatform,
    getPoImportPlatform,
  );
}

function rowContext(mapping: Record<string, string>): PoRowContext {
  return { mapping: mapping as PoRowContext['mapping'], preset: poPresetForPlatform(platform), platform };
}

function project(row: Record<string, string>, mapping: Record<string, string>): Record<PoField, string> {
  const out = {} as Record<PoField, string>;
  for (const field of PO_FIELDS) out[field] = mapping[field] ? (row[mapping[field]] ?? '').trim() : '';
  return out;
}

function classify(row: Record<string, string>, mapping: Record<string, string>) {
  const { problems } = poRowToDeskRow(row, 0, rowContext(mapping));
  return {
    status: problems.length ? ('action_required' as const) : ('ready' as const),
    missing: [...new Set(problems.map((p) => p.field))],
    problems: problems.map((p) => p.message),
  };
}

export const INBOUND_PO_IMPORT_DESCRIPTOR: TableImportDescriptor<PoField, InboundPoImportRowView> = {
  surfaceId: 'receiving-po-import',
  entityNoun: 'purchase orders',
  deskPath: INCOMING_SURFACE_ROUTE,
  fields: PO_FIELDS.map((key) => ({ key, label: PO_COLUMNS[key].label, required: PO_COLUMNS[key].required === 'always' })),
  autoMap(headers) {
    const preset = poPresetForPlatform(platform);
    return identifyColumns(headers, [], { preset, platform: platform || preset.platform }).mapping as Record<string, string>;
  },
  /** Loading a file also adopts its suggested platform (Goodwill words in the cells). */
  autoMapRows(headers, rows) {
    const suggested = suggestPoPlatform(headers, rows);
    if (suggested) setPoImportPlatform(suggested);
    const preset = poPresetForPlatform(platform);
    return identifyColumns(headers, rows, { preset, platform: platform || preset.platform }).mapping as Record<string, string>;
  },
  classify(row, mapping) {
    const { status, missing } = classify(row, mapping);
    return { status, missing };
  },
  project,
  applyEdits(row, mapping, edits) {
    const next = { ...row };
    for (const key of Object.keys(edits) as PoField[]) {
      const header = mapping[key];
      const value = edits[key];
      if (header && value !== undefined) next[header] = value.trim();
    }
    return next;
  },
  toRowView(row, mapping, index) {
    const { status, missing, problems } = classify(row, mapping);
    const p = project(row, mapping);
    return {
      index,
      status,
      missing,
      problems,
      orderNumber: p.order_number,
      title: p.item_title,
      sku: p.sku,
      quantity: p.quantity,
      unitCost: p.unit_cost,
      tracking: p.tracking,
      itemId: p.item_id,
    };
  },
  searchValues(view) {
    return [view.orderNumber, view.title, view.sku, view.tracking, view.itemId];
  },
  /** The whole file goes — the server holds any order with a problem row, whole. */
  async commit({ rows, mapping }) {
    const outcome = await postPoCsvImport({
      headers: Object.keys(rows[0] ?? {}),
      rows,
      platform,
      mapping: mapping as Partial<Record<PoField, string>>,
      dryRun: false,
    });
    return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
  },
};
