/**
 * triage_orders_csv — assistant tool (order-import triage, session surface).
 *
 * The operator pastes a CSV of pending orders into the composer; this tool
 * runs it through the HOUSE import lane — the same parser (`parseCsv`), the
 * same header auto-mapper (`autoMapCsvOrderHeaders`), and the same
 * Ready-vs-Action-required rule (`classifyCsvOrderStagingRow`) the CSV import
 * desk uses — and returns the TRIAGE: which orders are accepted, which need
 * resolution and why. It writes NOTHING: the import itself is a human action
 * (the triage artifact carries an "Import accepted" button that posts the
 * accepted rows to POST /api/orders/import-csv under the user's own session —
 * the same chokepoint the import desk uses).
 *
 * Item-number gaps are the operator's next move: rows missing an item number
 * but carrying a title or SKU are exactly what `resolve_item_number` resolves,
 * after which the agent re-renders the triage with the numbers filled in.
 */

import { z } from 'zod';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import {
  autoMapCsvOrderHeaders,
  classifyCsvOrderStagingRow,
  CSV_ORDER_CANONICAL_FIELDS,
  projectCsvOrderRow,
} from '@/lib/orders/csv-order-import';
import type { AssistantToolDef } from './types';

/** The response is model food — cap it and say so. */
const MAX_ROWS_IN_RESPONSE = 60;

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  CSV_ORDER_CANONICAL_FIELDS.map((f) => [f.key, f.label]),
);

function humanizeMissing(missing: string[]): string {
  return missing.map((m) => FIELD_LABELS[m] ?? m).join(', ');
}

export const triageOrdersCsvTool: AssistantToolDef<
  z.ZodObject<{ csv: z.ZodString }>,
  unknown
> = {
  name: 'triage_orders_csv',
  description:
    'Triage a pasted CSV of pending orders for import. Parses it with the house order-import lane, auto-maps the headers, and classifies every row: accepted (ready to import), needs_resolution (which fields are missing — item-number gaps are resolvable with resolve_item_number), or rejected (no order number). Returns the header mapping, per-row status + reason, and projected canonical rows for the accepted ones. SHOW the result as an import_triage artifact — the user imports the accepted rows from the panel. Never invent item numbers; resolve them.',
  permission: 'operations.view',
  inputSchema: z.object({
    csv: z.string().min(1).max(200_000),
  }),
  run: async (input) => {
    const parsed = parseCsv(input.csv);
    if (parsed.rows.length === 0) {
      return { ok: false as const, error: 'No data rows found in the pasted CSV.' };
    }
    const mapping = autoMapCsvOrderHeaders(parsed.headers);
    if (!mapping.order_number) {
      return {
        ok: false as const,
        error:
          'Could not map an order-number column. Detected headers: ' +
          parsed.headers.join(', ') +
          '. Ask the operator which column holds the order number.',
      };
    }

    const rows: Array<{
      orderNumber: string;
      itemNumber: string;
      itemTitle: string;
      quantity: string;
      status: 'accepted' | 'needs_resolution';
      reason: string;
    }> = [];
    let rejected = 0;
    const seenOrderNumbers = new Set<string>();

    for (const row of parsed.rows) {
      const orderNumber = mapping.order_number ? (row[mapping.order_number] ?? '').trim() : '';
      if (!orderNumber) {
        rejected += 1;
        continue;
      }
      const { status, missing } = classifyCsvOrderStagingRow(row, mapping);
      const projected = projectCsvOrderRow(row, mapping);
      const duplicate = seenOrderNumbers.has(orderNumber);
      seenOrderNumbers.add(orderNumber);
      rows.push({
        orderNumber,
        itemNumber: projected.item_number,
        itemTitle: projected.item_title,
        quantity: projected.quantity,
        status: status === 'ready' && !duplicate ? 'accepted' : 'needs_resolution',
        reason: duplicate
          ? 'Duplicate order number in this file'
          : missing.length > 0
            ? `Missing: ${humanizeMissing(missing)}`
            : 'Accepted',
      });
      if (rows.length >= MAX_ROWS_IN_RESPONSE) break;
    }

    const accepted = rows.filter((r) => r.status === 'accepted');
    const needsResolution = rows.filter((r) => r.status === 'needs_resolution');
    return {
      ok: true as const,
      mapping,
      totalRows: parsed.rows.length,
      truncated: parsed.rows.length > rows.length,
      summary: {
        accepted: accepted.length,
        needsResolution: needsResolution.length,
        rejectedNoOrderNumber: rejected,
      },
      rows,
      acceptedRows: accepted.map((r) => projectCsvOrderRow(
        parsed.rows.find(
          (raw) => (mapping.order_number ? (raw[mapping.order_number] ?? '').trim() : '') === r.orderNumber,
        ) ?? {},
        mapping,
      )),
      nextSteps: [
        needsResolution.some((r) => r.reason.includes('Item number'))
          ? 'Resolve missing item numbers with resolve_item_number (they carry a title or SKU), then re-render this triage.'
        : null,
        'Render the triage as an import_triage artifact — the user imports the accepted rows from the panel.',
      ].filter(Boolean),
    };
  },
};
