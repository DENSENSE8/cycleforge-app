/** The ONE export field registry — what a table can write, as data. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { ExportCell } from '@/lib/tables/export/serialize';

export interface ExportField {
  /** Stable id — what persists, and what `toRow` is asked for. */
  id: string;
  /** The operator's word for it. */
  label: string;
  /** Heading in the picker. Omitted fields ride an unnamed leading group. */
  group?: string;
  /** In the default tier's column set. */
  default: boolean;
  /**
   * True for a fact the DISPLAY cannot bind — a record id, a raw stamp.
   * Marked so the picker can say why an operator has never seen it as a column.
   */
  exportOnly?: boolean;
}

/** What a surface hands the export control. */
interface TableExportSpec<Row> {
  /** Every field this table can write, in export order. */
  fields: readonly ExportField[];
  /**
   * Serialize one row for a chosen field set. Pure, and ORDER-FAITHFUL — the
   * returned array lines up with `fieldIds` position for position.
   */
  toRow: (row: Row, fieldIds: readonly string[]) => readonly ExportCell[];
  /** Base filename without extension — the lane, e.g. `to-ship`. */
  filename: string;
}

/** Project a field catalog into export fields. */
export function exportFieldsFromCatalog(
  catalog: FieldCatalog,
  options: {
    defaults?: readonly string[];
    group?: string;
    extras?: readonly ExportField[];
  } = {},
): ExportField[] {
  const defaults = options.defaults ? new Set(options.defaults) : null;
  const fromCatalog: ExportField[] = catalog.map((field) => ({
    id: field.id,
    label: field.label,
    group: options.group,
    default: defaults ? defaults.has(field.id) : true,
  }));

  // The catalog wins a collision: one label, one id, one place to rename it.
  const taken = new Set(fromCatalog.map((f) => f.id));
  const extras = (options.extras ?? [])
    .filter((f) => !taken.has(f.id))
    .map((f) => ({ ...f, exportOnly: true }));

  return [...fromCatalog, ...extras];
}

/** The field ids an export will actually write. */
export function resolveExportFieldIds(
  fields: readonly ExportField[],
  chosen: readonly string[] | null | undefined,
): string[] {
  if (!chosen) return fields.filter((f) => f.default).map((f) => f.id);
  const wanted = new Set(chosen);
  const picked = fields.filter((f) => wanted.has(f.id)).map((f) => f.id);
  // A stored set that no longer matches ANY field would export a header-only
  // file. Fall back rather than hand back an empty spreadsheet.
  return picked.length > 0 ? picked : fields.filter((f) => f.default).map((f) => f.id);
}

/** Is this exactly the default set? Drives "Reset to default" being offered. */
export function isDefaultFieldSet(
  fields: readonly ExportField[],
  chosen: readonly string[] | null | undefined,
): boolean {
  if (!chosen) return true;
  const resolved = resolveExportFieldIds(fields, chosen);
  const defaults = fields.filter((f) => f.default).map((f) => f.id);
  return (
    resolved.length === defaults.length && resolved.every((id, i) => id === defaults[i])
  );
}

/** Toggle one field, keeping the stored value as a plain id list. */
export function toggleExportField(
  fields: readonly ExportField[],
  chosen: readonly string[] | null | undefined,
  fieldId: string,
): string[] {
  const current = new Set(resolveExportFieldIds(fields, chosen));
  if (current.has(fieldId)) current.delete(fieldId);
  else current.add(fieldId);
  return fields.filter((f) => current.has(f.id)).map((f) => f.id);
}

/** The picker's bands, in declaration order; the unnamed group leads. */
export function groupExportFields(
  fields: readonly ExportField[],
): { key: string; fields: ExportField[] }[] {
  const bands: { key: string; fields: ExportField[] }[] = [];
  for (const field of fields) {
    const key = field.group ?? '';
    const band = bands.find((b) => b.key === key);
    if (band) band.fields.push(field);
    else bands.push({ key, fields: [field] });
  }
  return bands;
}

/**
 * Shape-read a stored choice. Anything that is not a list of non-empty strings
 * is `null` — "no choice", which resolves to the defaults, rather than a
 * half-understood set that quietly drops columns from every export.
 */
export function readStoredExportFieldIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return out.length > 0 ? out : null;
}

/** Lift the legacy positional export shape into a field registry. */
export function exportSpecFromColumns<Row>(
  shape: {
    columns: readonly string[];
    toRow: (row: Row) => readonly ExportCell[];
  },
  filename: string,
): TableExportSpec<Row> {
  const fields: ExportField[] = shape.columns.map((label, index) => ({
    id: `col:${index}`,
    label,
    default: true,
  }));
  const indexOf = new Map(fields.map((f, i) => [f.id, i] as const));

  return {
    fields,
    toRow: (row, fieldIds) => {
      const cells = shape.toRow(row);
      return fieldIds.map((id) => {
        const at = indexOf.get(id);
        return at == null ? '' : cells[at];
      });
    },
    filename,
  };
}
