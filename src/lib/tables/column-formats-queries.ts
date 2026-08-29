import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  EMPTY_COLUMN_FORMAT,
  isEmptyColumnFormat,
  type ColumnFormat,
  type ColumnFormatMap,
} from '@/lib/tables/column-formats';

/**
 * Org-shared per-column formatting — read + upsert.
 *
 * Every query is org-scoped through `tenantQuery`; `orgId` comes from
 * `ctx.organizationId` at the route and never from the request body. See
 * `2026-08-29_table_column_formats.sql` for why this is per-column and
 * org-shared rather than per-cell and per-staff.
 */

interface ColumnFormatRow {
  column_key: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  text_color: string | null;
  fill_color: string | null;
  align: 'left' | 'center' | 'right' | null;
}

const COLS = `column_key, bold, italic, strike, text_color, fill_color, align`;

function toFormat(row: ColumnFormatRow): ColumnFormat {
  return {
    bold: row.bold,
    italic: row.italic,
    strike: row.strike,
    textColor: row.text_color,
    fillColor: row.fill_color,
    align: row.align,
  };
}

/** Every format for one table, keyed by column. Absent column ⇒ unformatted. */
export async function listColumnFormats(
  orgId: OrgId,
  tableId: string,
): Promise<ColumnFormatMap> {
  const { rows } = await tenantQuery<ColumnFormatRow>(
    orgId,
    `SELECT ${COLS}
       FROM table_column_formats
      WHERE organization_id = $1
        AND table_id = $2`,
    [orgId, tableId],
  );
  const map: Record<string, ColumnFormat> = {};
  for (const row of rows) map[row.column_key] = toFormat(row);
  return map;
}

/**
 * Write one column's format.
 *
 * A format that carries no visual change is DELETED rather than stored as a row
 * of falses. Otherwise every column an operator ever bolded and un-bolded would
 * leave a tombstone behind, the read would return a map full of no-ops, and
 * `columnFormatClass` would be called for columns that format to `''` — the
 * table would slowly accumulate rows that mean "nothing". Returns the format as
 * it now stands so the client does not have to guess.
 */
export async function upsertColumnFormat(
  orgId: OrgId,
  tableId: string,
  columnKey: string,
  format: ColumnFormat,
  staffId: number | null,
): Promise<ColumnFormat> {
  if (isEmptyColumnFormat(format)) {
    await tenantQuery(
      orgId,
      `DELETE FROM table_column_formats
        WHERE organization_id = $1 AND table_id = $2 AND column_key = $3`,
      [orgId, tableId, columnKey],
    );
    return EMPTY_COLUMN_FORMAT;
  }

  // `fillColor: 'none'` is the palette's way of saying "no fill" and must not be
  // persisted as a value — otherwise the resolver has to know that one swatch
  // key means absence, in two places.
  const fill = format.fillColor === 'none' ? null : format.fillColor;

  const { rows } = await tenantQuery<ColumnFormatRow>(
    orgId,
    `INSERT INTO table_column_formats
       (organization_id, table_id, column_key, bold, italic, strike,
        text_color, fill_color, align, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (organization_id, table_id, column_key) DO UPDATE SET
       bold = EXCLUDED.bold,
       italic = EXCLUDED.italic,
       strike = EXCLUDED.strike,
       text_color = EXCLUDED.text_color,
       fill_color = EXCLUDED.fill_color,
       align = EXCLUDED.align,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING ${COLS}`,
    [
      orgId,
      tableId,
      columnKey,
      format.bold,
      format.italic,
      format.strike,
      format.textColor,
      fill,
      format.align,
      staffId,
    ],
  );
  const row = rows[0];
  return row ? toFormat(row) : EMPTY_COLUMN_FORMAT;
}

/** Drop every format on a table — the operator's "Clear formatting". */
export async function clearColumnFormats(
  orgId: OrgId,
  tableId: string,
): Promise<number> {
  const { rowCount } = await tenantQuery(
    orgId,
    `DELETE FROM table_column_formats
      WHERE organization_id = $1 AND table_id = $2`,
    [orgId, tableId],
  );
  return rowCount ?? 0;
}
