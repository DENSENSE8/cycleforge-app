'use client';

/**
 * Import orders › Columns — every header of the file, what it is saved as,
 * a sample value and the database column it lands in. A column bound to no
 * field reads "Not saved". Display method: AdminTable (a file's 5–40 headers,
 * four facts, one edit per row).
 */

import { useMemo } from 'react';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable/AdminTable';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { PO_COLUMNS, PO_FIELDS, type PoField, type PoIdentifiedColumn } from '@/lib/inbound/po-columns';

const NOT_SAVED = 'Not saved';

export function ImportColumnMapping({
  columns,
  onRemap,
}: {
  columns: readonly PoIdentifiedColumn[];
  /** Bind `header` to `field` ('' = leave the column out). */
  onRemap: (header: string, field: PoField | '') => void;
}) {
  const fieldOptions = useMemo(
    () => [{ value: '', label: NOT_SAVED }, ...PO_FIELDS.map((field) => ({ value: field, label: PO_COLUMNS[field].label }))],
    [],
  );
  const tableColumns = useMemo<AdminTableColumn<PoIdentifiedColumn>[]>(
    () => [
      {
        key: 'header',
        header: 'File column',
        type: 'text',
        cell: (col) => <span className="block max-w-40 whitespace-normal font-medium text-text-default">{col.header}</span>,
      },
      {
        key: 'sample',
        header: 'Sample',
        type: 'text',
        cell: (col) =>
          col.sample ? (
            <span className="block max-w-32 truncate text-text-muted" title={col.sample}>
              {col.sample}
            </span>
          ) : (
            <span className="text-text-faint">Blank</span>
          ),
      },
      {
        key: 'field',
        header: 'Saved as',
        type: 'text',
        width: '12rem',
        cell: (col) => (
          <SearchableSelectField
            value={col.field ?? ''}
            options={fieldOptions}
            onChange={(value) => onRemap(col.header, (value ?? '') as PoField | '')}
            ariaLabel={`What ${col.header} is saved as`}
            searchPlaceholder="Find a field…"
            appearance="flush"
            testId={`import-map-${col.header}`}
          />
        ),
      },
      {
        key: 'column',
        header: 'Lands in',
        type: 'text',
        cell: (col) =>
          // Capped and wrapping, so the four columns fit the card instead of running past its edge.
          col.field ? (
            <span className="block max-w-40 whitespace-normal break-all font-mono text-role-caption text-text-muted">
              {PO_COLUMNS[col.field].target.column}
            </span>
          ) : (
            <span className="text-text-faint">{NOT_SAVED}</span>
          ),
      },
    ],
    [fieldOptions, onRemap],
  );
  return <AdminTable columns={tableColumns} rows={[...columns]} rowKey={(col) => col.header} stickyHeader={false} />;
}
